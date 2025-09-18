import { PrismaClient, Position, Signal } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { TradingSignal } from '../types';
import { HyperliquidClient, OrderRequest, Position as HLPosition } from './hyperliquid-client';
import { WalletManager } from './wallet-manager';
import { WebSocketService } from './websocket';

export interface PyramidConfig {
  // Pyramid settings
  marginPercentages: number[];   // [10, 15, 20, 25] - % of account to use as margin
  exitPercentages: number[];     // [25, 25, 25, 25] - % of position to exit
  fixedLeverage: number;         // 5 - Fixed leverage for all positions

  // Risk management
  maxPyramidLevels: number;      // 4
  maxAccountExposure: number;    // 0.70 - Never use more than 70% of account
  stopLossPercentage: number;    // 10% (wider for pyramiding)
  trailingStopPercentage: number; // 5%

  // Position tracking
  resetAfterFullExit: boolean;   // true
  enablePyramiding: boolean;     // true
}

interface PyramidState {
  symbol: string;
  currentLevel: number;       // 0-3, which pyramid level we're at
  exitCount: number;
  totalSize: number;          // Total position size
  currentSize: number;        // Current position size (same as totalSize, kept for compatibility)
  averageEntryPrice: number;
  averageEntry: number;       // Alias for averageEntryPrice
  entryCount: number;         // Number of entries made
  totalMarginUsed: number;    // Total margin committed
  isActive: boolean;
  positions: Array<{
    size: number;
    entry: number;
    marginUsed: number;
    timestamp: Date;
  }>;
}

export class PyramidTradingEngine {
  private isProcessing = false;
  private hyperliquidClient: HyperliquidClient | null = null;
  private walletManager: WalletManager;
  private config: PyramidConfig;
  private pyramidStates: Map<string, PyramidState> = new Map();

  constructor(
    private prisma: PrismaClient,
    private redis: Redis | null,
    private wsService: WebSocketService
  ) {
    this.walletManager = new WalletManager(prisma);

    // Load pyramid configuration from environment with style presets
    const pyramidStyle = process.env.PYRAMID_STYLE || 'increasing'; // 'increasing', 'decreasing', or 'custom'

    // Define preset configurations with FIXED leverage
    const presets = {
      moderate: {
        marginPercentages: [10, 15, 20, 25],  // Total: 70% of account
        exitPercentages: [25, 25, 25, 25],
        fixedLeverage: 5
      },
      conservative: {
        marginPercentages: [5, 10, 15, 20],   // Total: 50% of account
        exitPercentages: [25, 25, 25, 25],
        fixedLeverage: 5
      },
      aggressive: {
        marginPercentages: [15, 20, 25, 30],  // Total: 90% of account
        exitPercentages: [25, 25, 25, 25],
        fixedLeverage: 5
      },
      equal: {
        marginPercentages: [15, 15, 15, 15],  // Total: 60% of account
        exitPercentages: [25, 25, 25, 25],
        fixedLeverage: 5
      }
    };

    // Use preset or custom configuration
    let selectedConfig;
    if (pyramidStyle === 'custom') {
      selectedConfig = {
        marginPercentages: (process.env.PYRAMID_MARGIN_PERCENTAGES || '10,15,20,25').split(',').map(Number),
        exitPercentages: (process.env.PYRAMID_EXIT_PERCENTAGES || '25,25,25,25').split(',').map(Number),
        fixedLeverage: Number(process.env.FIXED_LEVERAGE || '5')
      };
    } else {
      selectedConfig = presets[pyramidStyle as keyof typeof presets] || presets.moderate;
    }

    this.config = {
      ...selectedConfig,
      maxPyramidLevels: parseInt(process.env.MAX_PYRAMID_LEVELS || '4'),
      maxAccountExposure: parseFloat(process.env.MAX_ACCOUNT_EXPOSURE || '0.70'),
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '10'),
      trailingStopPercentage: parseFloat(process.env.TRAILING_STOP_PERCENTAGE || '5'),
      resetAfterFullExit: process.env.RESET_AFTER_FULL_EXIT !== 'false',
      enablePyramiding: process.env.ENABLE_PYRAMIDING !== 'false'
    };

    logger.info(`Pyramid Trading Engine initialized with '${pyramidStyle}' style`, { config: this.config });
  }

  async start() {
    logger.info('Starting pyramid trading engine');

    // Load existing positions into pyramid state
    await this.loadExistingPositions();

    // Start signal processing loop
    this.processSignals();

    // Start position monitoring
    this.monitorPositions();

    // Start risk management loop
    this.monitorRisk();

    logger.info('Pyramid trading engine started');
  }

  /**
   * Load existing open positions from database into pyramid state
   */
  private async loadExistingPositions() {
    try {
      const openPositions = await this.prisma.position.findMany({
        where: { status: 'open' }
      });

      for (const position of openPositions) {
        const symbol = position.symbol;
        const avgEntry = position.entryPrice.toNumber();
        const size = position.size.toNumber();

        // Skip invalid/corrupted positions
        if (avgEntry < 1 || avgEntry > 100000) {
          logger.warn(`Skipping corrupted position for ${symbol}`, {
            size,
            averageEntry: avgEntry,
            reason: 'Invalid entry price'
          });

          // Close the corrupted position in database
          await this.prisma.position.update({
            where: { id: position.id },
            data: { status: 'closed', closedAt: new Date() }
          });
          continue;
        }

        const state: PyramidState = {
          symbol,
          currentLevel: 1,
          entryCount: 1, // Assume at least one entry
          exitCount: 0,
          totalSize: size,
          currentSize: size,
          averageEntryPrice: avgEntry,
          averageEntry: avgEntry,
          totalMarginUsed: size * avgEntry / this.config.fixedLeverage,
          isActive: true,
          positions: [{
            size: size,
            entry: avgEntry,
            marginUsed: size * avgEntry / this.config.fixedLeverage,
            timestamp: position.openedAt
          }]
        };

        // Check if metadata has pyramid info (metadata might not exist)
        // const metadata = position.metadata as any;
        // if (metadata?.pyramidLevel) {
        //   state.entryCount = metadata.pyramidLevel;
        // }

        this.pyramidStates.set(symbol, state);
        logger.info(`Loaded existing position for ${symbol}`, {
          size: state.currentSize,
          averageEntry: state.averageEntry
        });
      }

      logger.info(`Loaded ${openPositions.length} existing positions into pyramid state`);
    } catch (error) {
      logger.error('Error loading existing positions', error);
    }
  }

  setHyperliquidClient(client: HyperliquidClient) {
    this.hyperliquidClient = client;
    logger.info('Hyperliquid client set for pyramid engine');
  }

  async initializeHyperliquid(userId: string): Promise<HyperliquidClient> {
    // If client is already set from app.ts, use it
    if (this.hyperliquidClient) {
      return this.hyperliquidClient;
    }

    // Try to use wallet from environment variable first
    const envPrivateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;
    if (envPrivateKey && envPrivateKey !== 'encrypted-private-key-placeholder') {
      this.hyperliquidClient = new HyperliquidClient({
        privateKey: envPrivateKey,
        isTestnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
      });

      await this.hyperliquidClient.initialize();
      return this.hyperliquidClient;
    }

    // Fallback to database wallet (old system)
    const wallet = await this.walletManager.getActiveWallet(userId);
    if (!wallet) {
      throw new Error('No active wallet found for user or environment');
    }

    const decryptedPrivateKey = await this.walletManager.getDecryptedPrivateKey(
      wallet.id,
      userId
    );

    this.hyperliquidClient = new HyperliquidClient({
      privateKey: decryptedPrivateKey,
      isTestnet: wallet.isTestnet
    });

    await this.hyperliquidClient.initialize();
    return this.hyperliquidClient;
  }

  /**
   * Process incoming trading signals with pyramid logic
   */
  async processSignal(signal: TradingSignal, userId: string): Promise<void> {
    try {
      logger.info('Processing signal with pyramid logic', { signal, userId });

      // Initialize Hyperliquid if needed
      if (!this.hyperliquidClient) {
        logger.info('Initializing Hyperliquid client for signal processing');
        await this.initializeHyperliquid(userId);
        logger.info('Hyperliquid client initialized successfully');
      }

      // Get or create pyramid state for this symbol
      const state = this.getPyramidState(signal.symbol);
      logger.info('Current pyramid state', {
        symbol: signal.symbol,
        entryCount: state.entryCount,
        currentSize: state.currentSize,
        positions: state.positions.length
      });

      if (signal.action === 'buy') {
        logger.info('Processing BUY signal');
        await this.handleBuySignal(signal, userId, state);
      } else if (signal.action === 'sell') {
        logger.info('Processing SELL signal');
        await this.handleSellSignal(signal, userId, state);
      }

      // Save state
      this.pyramidStates.set(signal.symbol, state);

      // Emit update to websocket
      this.wsService.broadcastPositionUpdate(userId, {
        symbol: signal.symbol,
        pyramidLevel: state.entryCount,
        exitLevel: state.exitCount,
        currentSize: state.currentSize,
        averageEntry: state.averageEntry
      });

      logger.info('Signal processed successfully', {
        symbol: signal.symbol,
        action: signal.action,
        pyramidLevel: state.entryCount
      });

    } catch (error: any) {
      logger.error('Error processing pyramid signal', {
        error: error.message,
        stack: error.stack,
        signal,
        userId
      });
      throw error;
    }
  }

  /**
   * Handle buy signal - add to pyramid position
   */
  private async handleBuySignal(
    signal: TradingSignal,
    userId: string,
    state: PyramidState
  ): Promise<void> {
    // Check if we can add more pyramid levels
    if (state.currentLevel >= this.config.maxPyramidLevels) {
      logger.info(`Max pyramid level (${this.config.maxPyramidLevels}) reached for ${signal.symbol}`);
      return;
    }

    // Get account balance
    const wallet = await this.walletManager.getActiveWallet(userId);
    if (!wallet) throw new Error('No active wallet');

    const accountValue = await this.hyperliquidClient!.getAccountValue();

    // Check if we would exceed max exposure
    const marginPercentage = this.config.marginPercentages[state.currentLevel];
    const marginToUse = accountValue * (marginPercentage / 100);

    if ((state.totalMarginUsed + marginToUse) > (accountValue * this.config.maxAccountExposure)) {
      logger.warn(`Would exceed max account exposure (${this.config.maxAccountExposure * 100}%)`, {
        currentMargin: state.totalMarginUsed,
        newMargin: marginToUse,
        totalWouldBe: state.totalMarginUsed + marginToUse,
        maxAllowed: accountValue * this.config.maxAccountExposure
      });
      return;
    }

    // Calculate position size with FIXED leverage
    const positionValue = marginToUse * this.config.fixedLeverage;

    logger.info('📊 POSITION SIZING', {
      accountValue: `$${accountValue.toFixed(2)}`,
      pyramidLevel: state.currentLevel + 1,
      marginPercentage: `${marginPercentage}%`,
      marginToUse: `$${marginToUse.toFixed(2)}`,
      fixedLeverage: `${this.config.fixedLeverage}x`,
      positionValue: `$${positionValue.toFixed(2)}`
    })

    // Get actual market price - NEVER trust the webhook price
    let currentPrice = await this.hyperliquidClient!.getMarketPrice(signal.symbol);
    logger.info(`Fetched market price for ${signal.symbol}: $${currentPrice}`);

    // Round to 2 decimal places for SOL-PERP (Hyperliquid requirement)
    const rawSize = positionValue / currentPrice;
    const sizeInAsset = Math.floor(rawSize * 100) / 100;

    logger.info(`Adding pyramid level ${state.currentLevel + 1}`, {
      symbol: signal.symbol,
      currentPrice: `$${currentPrice.toFixed(2)}`,
      size: `${sizeInAsset} SOL`,
      positionValue: `$${positionValue.toFixed(2)}`
    });

    // NOTE: Leverage should be set manually on Hyperliquid to 5x
    // We're not setting it programmatically anymore

    // Place the order on Hyperliquid with proper tick size rounding
    const tickSize = 0.05; // SOL-PERP tick size
    const limitPrice = Math.round((currentPrice * 1.001) / tickSize) * tickSize;

    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: true,
      sz: sizeInAsset,
      limit_px: limitPrice,
      order_type: 'limit',
      reduce_only: false
    };

    logger.info('Placing order on Hyperliquid', { orderRequest });

    let orderResult: any;
    try {
      orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);
      logger.info('Order placed successfully', { orderResult });
    } catch (orderError: any) {
      logger.error('Failed to place order on Hyperliquid', {
        error: orderError.message,
        orderRequest,
        stack: orderError.stack
      });
      throw new Error(`Failed to place order: ${orderError.message}`);
    }

    // Update pyramid state
    const newPosition = {
      size: sizeInAsset,
      entry: currentPrice,
      marginUsed: marginToUse,
      timestamp: new Date()
    };

    state.positions.push(newPosition);
    state.currentLevel++;
    state.totalSize += sizeInAsset;
    state.totalMarginUsed += marginToUse;
    state.isActive = true;

    // Calculate new average entry
    state.averageEntryPrice = this.calculateAverageEntry(state.positions);

    // Store signal in database
    await this.prisma.signal.create({
      data: {
        userId,
        symbol: signal.symbol,
        action: signal.action,
        strategy: signal.strategy,
        metadata: {
          pyramidLevel: state.currentLevel,
          size: positionValue,
          sizeInAsset,
          marginUsed: marginToUse,
          fixedLeverage: this.config.fixedLeverage,
          orderResult
        } as any
      }
    });

    // Create or update position in database
    await this.updatePositionInDatabase(userId, signal.symbol, state);

    logger.info(`Pyramid level ${state.currentLevel} added successfully`, {
      symbol: signal.symbol,
      totalSize: state.totalSize,
      averageEntry: state.averageEntryPrice
    });
  }

  /**
   * Handle sell signal - reduce pyramid position
   * SIMPLIFIED: Just check Hyperliquid and sell 25% of whatever position exists
   */
  private async handleSellSignal(
    signal: TradingSignal,
    userId: string,
    state: PyramidState
  ): Promise<void> {
    // ALWAYS check Hyperliquid directly for the actual position
    logger.info(`Checking Hyperliquid for ${signal.symbol} position...`);

    const positions = await this.hyperliquidClient!.getPositions();
    const hlPosition = positions.find(p => p.coin === signal.symbol);

    if (!hlPosition || Math.abs(parseFloat(hlPosition.szi)) < 0.0001) {
      logger.info(`No position found on Hyperliquid for ${signal.symbol}, nothing to sell`);
      return;
    }

    // We have a position! Get its size
    const currentSize = Math.abs(parseFloat(hlPosition.szi));
    const entryPrice = parseFloat(hlPosition.entryPx);

    logger.info(`Found ${signal.symbol} position on Hyperliquid`, {
      size: currentSize,
      entryPrice: entryPrice,
      positionValue: currentSize * entryPrice
    });

    // SIMPLE STRATEGY: First sell 50%, second sell closes everything
    // Track if this is first or second sell using a simple counter in Redis
    const sellCountKey = `sell_count:${signal.symbol}:${userId}`;
    let sellCount = 1;

    if (this.redis) {
      const count = await this.redis.get(sellCountKey);
      sellCount = count ? parseInt(count) + 1 : 1;
      await this.redis.set(sellCountKey, sellCount.toString(), 'EX', 3600); // Reset after 1 hour
    }

    // Determine exit size based on sell count
    let exitSize: number;
    if (sellCount === 1) {
      // First sell: 50% of position
      const rawExitSize = currentSize * 0.5;
      exitSize = Math.floor(rawExitSize * 100) / 100;
      logger.info('First sell signal - selling 50% of position', { exitSize });
    } else {
      // Second or subsequent sell: close entire position
      exitSize = currentSize;
      logger.info('Second sell signal - closing entire position', { exitSize });

      // Reset counter after closing position
      if (this.redis) {
        await this.redis.del(sellCountKey);
      }
    }

    logger.info(`Executing sell strategy`, {
      symbol: signal.symbol,
      sellNumber: sellCount,
      currentSize: currentSize,
      exitSize: exitSize,
      remainingSize: (currentSize - exitSize),
      action: sellCount === 1 ? 'Selling 50%' : 'Closing position'
    });

    // Get current price if not provided
    const currentPrice = signal.price || await this.hyperliquidClient!.getMarketPrice(signal.symbol);

    // Place the reduce order on Hyperliquid with proper tick size
    const tickSize = 0.05; // SOL-PERP tick size
    const limitPrice = Math.round((currentPrice * 0.999) / tickSize) * tickSize;

    // Place market order to reduce position
    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: false,
      sz: exitSize,
      order_type: 'market', // Use market order for immediate execution
      reduce_only: true // Important: this reduces the position
    };

    logger.info('Placing SELL order', orderRequest);

    const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);

    if (orderResult.status === 'ok') {
      logger.info('✅ SELL order executed successfully', {
        symbol: signal.symbol,
        exitSize: exitSize,
        orderResult: orderResult.response
      });
    } else {
      logger.error('❌ SELL order failed', {
        symbol: signal.symbol,
        error: orderResult.error
      });
      throw new Error(`Order failed: ${orderResult.error}`);
    }

    // Store trade record in database
    await this.prisma.trade.create({
      data: {
        userId,
        signalId: signal.id,
        symbol: signal.symbol,
        side: 'sell',
        type: 'market',
        size: exitSize,
        price: signal.price,
        executedAt: new Date(),
        status: 'executed'
      }
    });

    // Simple check: if remaining position is tiny, consider it closed
    const remainingSize = currentSize - exitSize;
    if (remainingSize <= 0.01) {
      logger.info(`Position essentially closed for ${signal.symbol} (remaining: ${remainingSize})`);

      // Mark position as closed in database
      await this.prisma.position.updateMany({
        where: {
          userId,
          symbol: signal.symbol,
          status: 'open'
        },
        data: {
          status: 'closed',
          closedAt: new Date()
        }
      });
    }

    logger.info(`Position reduced successfully`, {
      symbol: signal.symbol,
      soldSize: exitSize,
      remainingSize: remainingSize
    });
  }

  /**
   * Get or create pyramid state for a symbol
   */
  private getPyramidState(symbol: string): PyramidState {
    if (!this.pyramidStates.has(symbol)) {
      this.pyramidStates.set(symbol, {
        symbol,
        currentLevel: 0,
        entryCount: 0,
        exitCount: 0,
        totalSize: 0,
        currentSize: 0,
        averageEntryPrice: 0,
        averageEntry: 0,
        totalMarginUsed: 0,
        isActive: true,
        positions: []
      });
    }
    return this.pyramidStates.get(symbol)!;
  }

  /**
   * Calculate weighted average entry price
   */
  private calculateAverageEntry(positions: Array<{ size: number; entry: number }>): number {
    if (positions.length === 0) return 0;

    const totalValue = positions.reduce((sum, pos) => sum + (pos.size * pos.entry), 0);
    const totalSize = positions.reduce((sum, pos) => sum + pos.size, 0);

    return totalSize > 0 ? totalValue / totalSize : 0;
  }

  /**
   * Update position in database
   */
  private async updatePositionInDatabase(
    userId: string,
    symbol: string,
    state: PyramidState
  ): Promise<void> {
    const existingPosition = await this.prisma.position.findFirst({
      where: {
        userId,
        symbol,
        status: 'open'
      }
    });

    if (existingPosition) {
      // Update existing position
      await this.prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          size: new Decimal(state.currentSize),
          entryPrice: new Decimal(state.averageEntry)
        }
      });
    } else if (state.currentSize > 0) {
      // Create new position
      const wallet = await this.walletManager.getActiveWallet(userId);
      if (!wallet) throw new Error('No active wallet');

      await this.prisma.position.create({
        data: {
          userId,
          walletId: wallet.id,
          symbol,
          side: 'long',
          size: new Decimal(state.currentSize),
          entryPrice: new Decimal(state.averageEntry),
          status: 'open'
        }
      });
    }
  }

  /**
   * Process signals from Redis queue
   */
  private async processSignals() {
    if (!this.redis) {
      logger.warn('Redis not available, signal processing disabled');
      return;
    }

    setInterval(async () => {
      if (this.isProcessing) return;

      try {
        this.isProcessing = true;
        const signal = await this.redis.lpop('trading:signals');

        if (signal) {
          const parsedSignal = JSON.parse(signal);
          await this.processSignal(parsedSignal.signal, parsedSignal.userId);
        }
      } catch (error) {
        logger.error('Error processing signals', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Process every second
  }

  /**
   * Monitor open positions for stop loss and trailing stops
   */
  private async monitorPositions() {
    setInterval(async () => {
      try {
        const openPositions = await this.prisma.position.findMany({
          where: { status: 'open' }
        });

        for (const position of openPositions) {
          await this.checkPositionRisk(position);
        }
      } catch (error) {
        logger.error('Error monitoring positions', error);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Check individual position risk
   */
  private async checkPositionRisk(position: Position) {
    if (!this.hyperliquidClient) return;

    try {
      const currentPrice = await this.hyperliquidClient!.getMarketPrice(position.symbol);
      const entryPrice = position.entryPrice.toNumber();
      const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Check stop loss
      if (pnlPercentage <= -this.config.stopLossPercentage) {
        logger.warn(`Stop loss triggered for ${position.symbol}`, {
          pnlPercentage,
          stopLoss: this.config.stopLossPercentage
        });

        // Close position
        await this.closePosition(position);
      }

      // Simple trailing stop (if position is profitable)
      if (pnlPercentage > 20 && pnlPercentage < (20 - this.config.trailingStopPercentage)) {
        logger.info(`Trailing stop triggered for ${position.symbol}`, {
          pnlPercentage,
          trailingStop: this.config.trailingStopPercentage
        });

        // Close position
        await this.closePosition(position);
      }
    } catch (error) {
      logger.error(`Error checking risk for position ${position.id}`, error);
    }
  }

  /**
   * Close a position completely
   */
  private async closePosition(position: Position) {
    if (!this.hyperliquidClient) return;

    try {
      const orderRequest: OrderRequest = {
        coin: position.symbol,
        is_buy: false,
        sz: position.size.toNumber(),
        limit_px: 0, // Market order
        order_type: 'market',
        reduce_only: true
      };

      await this.hyperliquidClient!.placeOrder(orderRequest);

      // Update position status
      await this.prisma.position.update({
        where: { id: position.id },
        data: {
          status: 'closed',
          closedAt: new Date()
        }
      });

      // Reset pyramid state
      this.pyramidStates.delete(position.symbol);

      logger.info(`Position closed for ${position.symbol}`);
    } catch (error) {
      logger.error(`Error closing position ${position.id}`, error);
    }
  }

  /**
   * Get current pyramid states
   */
  public getStates(): Map<string, PyramidState> {
    return this.pyramidStates;
  }

  /**
   * Get pyramid configuration
   */
  public getConfig(): PyramidConfig {
    return this.config;
  }

  /**
   * Reset state for specific symbol
   */
  public resetSymbol(symbol: string): void {
    this.pyramidStates.delete(symbol);
    logger.info(`Pyramid state reset for ${symbol}`);
  }

  /**
   * Reset all pyramid states
   */
  public resetAll(): void {
    this.pyramidStates.clear();
    logger.info('All pyramid states reset');
  }

  /**
   * Monitor overall account risk
   */
  private async monitorRisk() {
    setInterval(async () => {
      try {
        // Get all active users
        const activeWallets = await this.prisma.wallet.findMany({
          where: { isActive: true }
        });

        for (const wallet of activeWallets) {
          await this.checkAccountRisk(wallet.userId);
        }
      } catch (error) {
        logger.error('Error monitoring account risk', error);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check account-level risk
   */
  private async checkAccountRisk(userId: string) {
    try {
      const wallet = await this.walletManager.getActiveWallet(userId);
      if (!wallet || !this.hyperliquidClient) return;

      const accountValue = await this.hyperliquidClient!.getAccountValue();
      const balanceInfo = { available: accountValue }; // Simple balance structure
      const positions = await this.prisma.position.findMany({
        where: { userId, status: 'open' }
      });

      // Calculate total exposure
      let totalExposure = 0;
      for (const position of positions) {
        totalExposure += position.size.toNumber() * position.entryPrice.toNumber();
      }

      const exposureRatio = totalExposure / balanceInfo.available;

      // Emergency deleverage if exposure too high
      if (exposureRatio > 5) {
        logger.error(`EMERGENCY: Exposure too high for user ${userId}`, {
          exposureRatio,
          balance: balanceInfo.available,
          totalExposure
        });

        // Reduce all positions by 50%
        for (const position of positions) {
          const reduceSize = position.size.toNumber() * 0.5;
          const orderRequest: OrderRequest = {
            coin: position.symbol,
            is_buy: false,
            sz: reduceSize,
            limit_px: 0,
            order_type: 'market',
            reduce_only: true
          };

          await this.hyperliquidClient!.placeOrder(orderRequest);
        }
      }
    } catch (error) {
      logger.error(`Error checking account risk for user ${userId}`, error);
    }
  }
}