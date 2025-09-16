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
  entryPercentages: number[];    // [40, 30, 20, 10]
  exitPercentages: number[];     // [40, 30, 20, 10]
  leverageLevels: number[];      // [3, 4, 5, 5]

  // Risk management
  maxPyramidLevels: number;      // 4
  stopLossPercentage: number;    // 10% (wider for pyramiding)
  trailingStopPercentage: number; // 5%

  // Position tracking
  resetAfterFullExit: boolean;   // true
  enablePyramiding: boolean;     // true
}

interface PyramidState {
  symbol: string;
  entryCount: number;
  exitCount: number;
  currentSize: number;
  averageEntry: number;
  totalCapitalUsed: number;
  positions: Array<{
    size: number;
    entry: number;
    leverage: number;
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

    // Define preset configurations
    const presets = {
      increasing: {
        entryPercentages: [15, 25, 30, 30],
        exitPercentages: [25, 25, 25, 25],
        leverageLevels: [4, 6, 8, 10]
      },
      decreasing: {
        entryPercentages: [40, 30, 20, 10],
        exitPercentages: [40, 30, 20, 10],
        leverageLevels: [10, 8, 6, 4]
      },
      equal: {
        entryPercentages: [25, 25, 25, 25],
        exitPercentages: [25, 25, 25, 25],
        leverageLevels: [7, 7, 7, 7]
      },
      conservative: {
        entryPercentages: [10, 15, 20, 25],
        exitPercentages: [25, 25, 25, 25],
        leverageLevels: [3, 4, 5, 6]
      }
    };

    // Use preset or custom configuration
    let selectedConfig;
    if (pyramidStyle === 'custom') {
      selectedConfig = {
        entryPercentages: (process.env.PYRAMID_ENTRY_PERCENTAGES || '15,25,30,30').split(',').map(Number),
        exitPercentages: (process.env.PYRAMID_EXIT_PERCENTAGES || '25,25,25,25').split(',').map(Number),
        leverageLevels: (process.env.PYRAMID_LEVERAGE_LEVELS || '4,6,8,10').split(',').map(Number)
      };
    } else {
      selectedConfig = presets[pyramidStyle as keyof typeof presets] || presets.increasing;
    }

    this.config = {
      ...selectedConfig,
      maxPyramidLevels: parseInt(process.env.MAX_PYRAMID_LEVELS || '4'),
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
        const state: PyramidState = {
          symbol,
          entryCount: 1, // Assume at least one entry
          exitCount: 0,
          currentSize: position.size.toNumber(),
          averageEntry: position.entryPrice.toNumber(),
          totalCapitalUsed: position.size.toNumber() * position.entryPrice.toNumber(),
          positions: [{
            size: position.size.toNumber() * position.entryPrice.toNumber(),
            entry: position.entryPrice.toNumber(),
            leverage: 3, // Default leverage, could be stored in metadata
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
    if (state.entryCount >= this.config.maxPyramidLevels) {
      logger.info(`Max pyramid level (${this.config.maxPyramidLevels}) reached for ${signal.symbol}`);
      return;
    }

    // Get account balance
    const wallet = await this.walletManager.getActiveWallet(userId);
    if (!wallet) throw new Error('No active wallet');

    const accountValue = await this.hyperliquidClient!.getAccountValue();

    // Calculate position size for this pyramid level WITH LEVERAGE
    const entryPercentage = this.config.entryPercentages[state.entryCount];
    const leverage = this.config.leverageLevels[state.entryCount];
    const positionSize = accountValue * (entryPercentage / 100) * leverage; // Apply leverage!
    const currentPrice = signal.price || await this.hyperliquidClient!.getMarketPrice(signal.symbol);
    // Round to 2 decimal places for SOL-PERP (Hyperliquid requirement)
    const rawSize = positionSize / currentPrice;
    const sizeInAsset = Math.floor(rawSize * 100) / 100;

    logger.info(`Adding pyramid level ${state.entryCount + 1}`, {
      symbol: signal.symbol,
      size: positionSize,
      leverage,
      entryPercentage
    });

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

    try {
      const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);
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
      size: positionSize,
      entry: signal.price,
      leverage,
      timestamp: new Date()
    };

    state.positions.push(newPosition);
    state.entryCount++;
    state.currentSize += sizeInAsset;
    state.totalCapitalUsed += positionSize;

    // Calculate new average entry
    state.averageEntry = this.calculateAverageEntry(state.positions);

    // Store signal in database
    await this.prisma.signal.create({
      data: {
        userId,
        symbol: signal.symbol,
        action: signal.action,
        strategy: signal.strategy,
        metadata: {
          pyramidLevel: state.entryCount,
          size: positionSize,
          sizeInAsset,
          leverage,
          orderResult
        } as any
      }
    });

    // Create or update position in database
    await this.updatePositionInDatabase(userId, signal.symbol, state);

    logger.info(`Pyramid level ${state.entryCount} added successfully`, {
      symbol: signal.symbol,
      totalSize: state.currentSize,
      averageEntry: state.averageEntry
    });
  }

  /**
   * Handle sell signal - reduce pyramid position
   */
  private async handleSellSignal(
    signal: TradingSignal,
    userId: string,
    state: PyramidState
  ): Promise<void> {
    // Check if we have a position to reduce
    if (state.currentSize === 0) {
      // Double-check by querying Hyperliquid directly
      logger.info(`No position in state for ${signal.symbol}, checking Hyperliquid...`);

      const positions = await this.hyperliquidClient!.getPositions();
      const hlPosition = positions.find(p => p.coin === signal.symbol);

      if (!hlPosition || Math.abs(parseFloat(hlPosition.szi)) < 0.0001) {
        logger.info(`No position found on Hyperliquid for ${signal.symbol}`);
        return;
      }

      // Position exists on Hyperliquid but not in our state, sync it
      logger.info(`Found position on Hyperliquid for ${signal.symbol}, syncing state...`, {
        size: hlPosition.szi,
        entry: hlPosition.entryPx
      });

      state.currentSize = Math.abs(parseFloat(hlPosition.szi));
      state.averageEntry = parseFloat(hlPosition.entryPx) || 0;
      state.entryCount = 1;
      state.positions = [{
        size: state.currentSize * state.averageEntry,
        entry: state.averageEntry,
        leverage: 3,
        timestamp: new Date()
      }];
    }

    // Calculate exit size for this level
    const exitPercentage = this.config.exitPercentages[Math.min(state.exitCount, this.config.exitPercentages.length - 1)];
    const rawExitSize = state.currentSize * (exitPercentage / 100);
    // Round to 2 decimal places for SOL-PERP
    const exitSize = Math.floor(rawExitSize * 100) / 100;

    logger.info(`Reducing position by ${exitPercentage}%`, {
      symbol: signal.symbol,
      exitSize,
      currentSize: state.currentSize
    });

    // Get current price if not provided
    const currentPrice = signal.price || await this.hyperliquidClient!.getMarketPrice(signal.symbol);

    // Place the reduce order on Hyperliquid with proper tick size
    const tickSize = 0.05; // SOL-PERP tick size
    const limitPrice = Math.round((currentPrice * 0.999) / tickSize) * tickSize;

    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: false,
      sz: exitSize,
      limit_px: limitPrice,
      order_type: 'limit',
      reduce_only: true // Important: this reduces the position
    };

    const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);

    // Update pyramid state
    state.exitCount++;
    state.currentSize -= exitSize;

    // Calculate profit for this exit
    const profit = (signal.price - state.averageEntry) * exitSize;

    // Store signal in database
    await this.prisma.signal.create({
      data: {
        userId,
        symbol: signal.symbol,
        action: signal.action,
        strategy: signal.strategy,
        metadata: {
          exitLevel: state.exitCount,
          size: exitSize,
          profit,
          orderResult
        } as any
      }
    });

    // Update position in database
    await this.updatePositionInDatabase(userId, signal.symbol, state);

    // Check if position is fully closed
    if (state.currentSize <= 0.0001 || state.exitCount >= this.config.exitPercentages.length) {
      logger.info(`Position fully closed for ${signal.symbol}`);

      if (this.config.resetAfterFullExit) {
        // Reset pyramid state for next cycle
        this.pyramidStates.delete(signal.symbol);
      }

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
      remainingSize: state.currentSize,
      exitLevel: state.exitCount
    });
  }

  /**
   * Get or create pyramid state for a symbol
   */
  private getPyramidState(symbol: string): PyramidState {
    if (!this.pyramidStates.has(symbol)) {
      this.pyramidStates.set(symbol, {
        symbol,
        entryCount: 0,
        exitCount: 0,
        currentSize: 0,
        averageEntry: 0,
        totalCapitalUsed: 0,
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