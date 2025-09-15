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

    // Load pyramid configuration from environment
    this.config = {
      entryPercentages: (process.env.PYRAMID_ENTRY_PERCENTAGES || '40,30,20,10').split(',').map(Number),
      exitPercentages: (process.env.PYRAMID_EXIT_PERCENTAGES || '40,30,20,10').split(',').map(Number),
      leverageLevels: (process.env.PYRAMID_LEVERAGE_LEVELS || '3,4,5,5').split(',').map(Number),
      maxPyramidLevels: parseInt(process.env.MAX_PYRAMID_LEVELS || '4'),
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '10'),
      trailingStopPercentage: parseFloat(process.env.TRAILING_STOP_PERCENTAGE || '5'),
      resetAfterFullExit: process.env.RESET_AFTER_FULL_EXIT !== 'false',
      enablePyramiding: process.env.ENABLE_PYRAMIDING !== 'false'
    };

    logger.info('Pyramid Trading Engine initialized', { config: this.config });
  }

  async start() {
    logger.info('Starting pyramid trading engine');

    // Start signal processing loop
    this.processSignals();

    // Start position monitoring
    this.monitorPositions();

    // Start risk management loop
    this.monitorRisk();

    logger.info('Pyramid trading engine started');
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
      logger.info('Processing signal with pyramid logic', { signal });

      // Initialize Hyperliquid if needed
      if (!this.hyperliquidClient) {
        await this.initializeHyperliquid(userId);
      }

      // Get or create pyramid state for this symbol
      const state = this.getPyramidState(signal.symbol);

      if (signal.action === 'buy') {
        await this.handleBuySignal(signal, userId, state);
      } else if (signal.action === 'sell') {
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

    } catch (error) {
      logger.error('Error processing pyramid signal', error);
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

    // Calculate position size for this pyramid level
    const entryPercentage = this.config.entryPercentages[state.entryCount];
    const leverage = this.config.leverageLevels[state.entryCount];
    const positionSize = accountValue * (entryPercentage / 100);
    const currentPrice = signal.price || await this.hyperliquidClient!.getMarketPrice(signal.symbol);
    const sizeInAsset = positionSize / currentPrice;

    logger.info(`Adding pyramid level ${state.entryCount + 1}`, {
      symbol: signal.symbol,
      size: positionSize,
      leverage,
      entryPercentage
    });

    // Place the order on Hyperliquid
    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: true,
      sz: sizeInAsset,
      limit_px: currentPrice * 1.001, // Slight slippage tolerance
      order_type: 'limit',
      reduce_only: false
    };

    const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);

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
        size: new Decimal(positionSize),
        leverage,
        metadata: {
          pyramidLevel: state.entryCount,
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
      logger.info(`No position to reduce for ${signal.symbol}`);
      return;
    }

    // Calculate exit size for this level
    const exitPercentage = this.config.exitPercentages[Math.min(state.exitCount, this.config.exitPercentages.length - 1)];
    const exitSize = state.currentSize * (exitPercentage / 100);

    logger.info(`Reducing position by ${exitPercentage}%`, {
      symbol: signal.symbol,
      exitSize,
      currentSize: state.currentSize
    });

    // Place the reduce order on Hyperliquid
    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      isBuy: false,
      size: exitSize,
      limitPrice: signal.price * 0.999, // Slight slippage tolerance
      orderType: 'limit',
      reduceOnly: true // Important: this reduces the position
    };

    const orderResult = await this.hyperliquidService!.placeOrder(orderRequest);

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
        size: new Decimal(exitSize),
        metadata: {
          exitLevel: state.exitCount,
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
    if (!this.hyperliquidService) return;

    try {
      const currentPrice = await this.hyperliquidService.getCurrentPrice(position.symbol);
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
    if (!this.hyperliquidService) return;

    try {
      const orderRequest: OrderRequest = {
        coin: position.symbol,
        isBuy: false,
        size: position.size.toNumber(),
        limitPrice: 0, // Market order
        orderType: 'market',
        reduceOnly: true
      };

      await this.hyperliquidService.placeOrder(orderRequest);

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
      if (!wallet || !this.hyperliquidService) return;

      const balanceInfo = await this.hyperliquidService.getBalance();
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
            isBuy: false,
            size: reduceSize,
            limitPrice: 0,
            orderType: 'market',
            reduceOnly: true
          };

          await this.hyperliquidService.placeOrder(orderRequest);
        }
      }
    } catch (error) {
      logger.error(`Error checking account risk for user ${userId}`, error);
    }
  }
}