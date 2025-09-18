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
  exitPercentages: number[];     // [50, 100] - Simplified: 50% first sell, 100% second sell
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
  exitCount: number;          // Track number of exits (0, 1, or 2)
  totalSize: number;          // Total position size
  currentSize: number;        // Current position size
  averageEntryPrice: number;  // Average entry price
  entryCount: number;         // Number of entries made
  totalMarginUsed: number;    // Total margin committed
  isActive: boolean;
  positions: Array<{
    size: number;
    entry: number;
    marginUsed: number;
    timestamp: Date;
  }>;
  lastSyncedSize?: number;    // Track last synced size from Hyperliquid
  lastSyncTime?: Date;        // Track last sync time
}

export class PyramidTradingEngine {
  private isProcessing = false;
  private hyperliquidClient: HyperliquidClient | null = null;
  private walletManager: WalletManager;
  private config: PyramidConfig;
  private pyramidStates: Map<string, PyramidState> = new Map();
  private signalProcessingInterval?: NodeJS.Timeout;
  private positionMonitoringInterval?: NodeJS.Timeout;
  private healthMonitoringInterval?: NodeJS.Timeout;
  private healthCheckData = {
    lastSignalProcessed: null as Date | null,
    lastHealthCheck: new Date(),
    version: process.env.BUILD_VERSION || Date.now().toString(),
    errors: [] as string[]
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis | null,
    private wsService: WebSocketService
  ) {
    this.walletManager = new WalletManager(prisma);

    // Load pyramid configuration with SIMPLIFIED exit strategy
    const pyramidStyle = process.env.PYRAMID_STYLE || 'moderate';

    // Define preset configurations with FIXED leverage and SIMPLE exit strategy
    const presets = {
      moderate: {
        marginPercentages: [10, 15, 20, 25],  // Total: 70% of account
        exitPercentages: [50, 100],           // SIMPLIFIED: 50% then 100%
        fixedLeverage: 5
      },
      conservative: {
        marginPercentages: [5, 10, 15, 20],   // Total: 50% of account
        exitPercentages: [50, 100],
        fixedLeverage: 5
      },
      aggressive: {
        marginPercentages: [15, 20, 25, 30],  // Total: 90% of account
        exitPercentages: [50, 100],
        fixedLeverage: 5
      }
    };

    // Use preset or custom configuration
    let selectedConfig = presets[pyramidStyle as keyof typeof presets] || presets.moderate;

    this.config = {
      ...selectedConfig,
      maxPyramidLevels: parseInt(process.env.MAX_PYRAMID_LEVELS || '4'),
      maxAccountExposure: parseFloat(process.env.MAX_ACCOUNT_EXPOSURE || '0.70'),
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '10'),
      trailingStopPercentage: parseFloat(process.env.TRAILING_STOP_PERCENTAGE || '5'),
      resetAfterFullExit: process.env.RESET_AFTER_FULL_EXIT !== 'false',
      enablePyramiding: process.env.ENABLE_PYRAMIDING !== 'false'
    };

    logger.info(`🚀 Pyramid Trading Engine (REFACTORED) initialized`, {
      config: this.config,
      version: this.healthCheckData.version
    });
  }

  async start() {
    logger.info('Starting refactored pyramid trading engine');

    // Load existing positions with validation
    await this.loadExistingPositions();

    // Start signal processing loop
    this.processSignals();

    // Start position monitoring with Hyperliquid sync
    this.monitorPositions();

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info('Refactored pyramid trading engine started');
  }

  /**
   * Load existing open positions from Hyperliquid API (truth source)
   */
  private async loadExistingPositions() {
    try {
      // Initialize Hyperliquid client first if not already done
      if (!this.hyperliquidClient) {
        const defaultUser = await this.getDefaultUser();
        if (defaultUser) {
          await this.initializeHyperliquid(defaultUser.id);
        }
      }

      if (!this.hyperliquidClient) {
        logger.warn('Cannot load positions - Hyperliquid client not initialized');
        return;
      }

      // Get actual positions from Hyperliquid (source of truth)
      const hlPositions = await this.hyperliquidClient.getPositions();

      for (const hlPosition of hlPositions) {
        const size = Math.abs(parseFloat(hlPosition.szi || '0'));
        if (size < 0.01) continue; // Skip tiny positions

        const symbol = hlPosition.coin;
        const avgEntry = parseFloat(hlPosition.entryPx || '0');

        // Validate entry price
        if (avgEntry < 1 || avgEntry > 1000000 || isNaN(avgEntry)) {
          logger.warn(`Invalid position data for ${symbol}`, {
            size,
            avgEntry,
            raw: hlPosition
          });
          continue;
        }

        const state: PyramidState = {
          symbol,
          currentLevel: 1,
          entryCount: 1,
          exitCount: 0,
          totalSize: size,
          currentSize: size,
          averageEntryPrice: avgEntry,
          totalMarginUsed: (size * avgEntry) / this.config.fixedLeverage,
          isActive: true,
          positions: [{
            size,
            entry: avgEntry,
            marginUsed: (size * avgEntry) / this.config.fixedLeverage,
            timestamp: new Date()
          }],
          lastSyncedSize: size,
          lastSyncTime: new Date()
        };

        this.pyramidStates.set(symbol, state);
        logger.info(`✅ Loaded position from Hyperliquid for ${symbol}`, {
          size: size.toFixed(2),
          averageEntry: avgEntry.toFixed(2),
          value: (size * avgEntry).toFixed(2)
        });
      }

      logger.info(`Loaded ${hlPositions.length} positions from Hyperliquid`);
    } catch (error) {
      logger.error('Error loading existing positions', error);
    }
  }

  setHyperliquidClient(client: HyperliquidClient) {
    this.hyperliquidClient = client;
    logger.info('Hyperliquid client set for refactored pyramid engine');
  }

  async initializeHyperliquid(userId: string): Promise<HyperliquidClient> {
    // If client is already set, use it
    if (this.hyperliquidClient) {
      return this.hyperliquidClient;
    }

    // Try environment variable first
    const envPrivateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;
    if (envPrivateKey && envPrivateKey !== 'encrypted-private-key-placeholder') {
      this.hyperliquidClient = new HyperliquidClient({
        privateKey: envPrivateKey,
        isTestnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
      });

      await this.hyperliquidClient.initialize();
      return this.hyperliquidClient;
    }

    // Fallback to database wallet
    const wallet = await this.walletManager.getActiveWallet(userId);
    if (!wallet) {
      throw new Error('No active wallet found');
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
   * Process incoming trading signals with improved error handling
   */
  async processSignal(signal: TradingSignal, userId: string): Promise<void> {
    try {
      logger.info('📊 Processing signal with refactored pyramid logic', {
        signal,
        userId,
        version: this.healthCheckData.version
      });

      // Initialize Hyperliquid if needed
      if (!this.hyperliquidClient) {
        await this.initializeHyperliquid(userId);
      }

      // Always sync with Hyperliquid first
      await this.syncPositionWithHyperliquid(signal.symbol);

      // Get or create pyramid state
      const state = this.getPyramidState(signal.symbol);

      if (signal.action === 'buy') {
        await this.handleBuySignal(signal, userId, state);
      } else if (signal.action === 'sell') {
        await this.handleSellSignal(signal, userId, state);
      }

      // Save state
      this.pyramidStates.set(signal.symbol, state);

      // Update health check
      this.healthCheckData.lastSignalProcessed = new Date();

      // Emit update to websocket
      this.wsService.broadcastPositionUpdate(userId, {
        symbol: signal.symbol,
        pyramidLevel: state.entryCount,
        exitLevel: state.exitCount,
        currentSize: state.currentSize,
        averageEntry: state.averageEntryPrice
      });

      logger.info('✅ Signal processed successfully', {
        symbol: signal.symbol,
        action: signal.action,
        pyramidLevel: state.entryCount,
        exitCount: state.exitCount
      });

    } catch (error: any) {
      this.healthCheckData.errors.push(`${new Date().toISOString()}: ${error.message}`);
      // Keep only last 10 errors
      if (this.healthCheckData.errors.length > 10) {
        this.healthCheckData.errors = this.healthCheckData.errors.slice(-10);
      }

      logger.error('❌ Error processing pyramid signal', {
        error: error.message,
        stack: error.stack,
        signal,
        userId
      });
      throw error;
    }
  }

  /**
   * Sync position state with Hyperliquid (source of truth)
   */
  private async syncPositionWithHyperliquid(symbol: string): Promise<void> {
    if (!this.hyperliquidClient) return;

    try {
      const positions = await this.hyperliquidClient.getPositions();
      const hlPosition = positions.find(p => p.coin === symbol);

      if (!hlPosition || Math.abs(parseFloat(hlPosition.szi || '0')) < 0.01) {
        // No position on Hyperliquid - reset state if we thought we had one
        if (this.pyramidStates.has(symbol)) {
          logger.info(`Position closed on Hyperliquid for ${symbol}, resetting state`);
          this.pyramidStates.delete(symbol);
        }
        return;
      }

      const currentSize = Math.abs(parseFloat(hlPosition.szi));
      const state = this.getPyramidState(symbol);

      // Update state with actual Hyperliquid data
      state.currentSize = currentSize;
      state.totalSize = currentSize;
      state.lastSyncedSize = currentSize;
      state.lastSyncTime = new Date();

      // Only update average entry if we don't have it or it's significantly different
      const hlEntry = parseFloat(hlPosition.entryPx || '0');
      if (hlEntry > 0 && (!state.averageEntryPrice || Math.abs(state.averageEntryPrice - hlEntry) > 0.01)) {
        state.averageEntryPrice = hlEntry;
      }

      logger.info(`📡 Synced ${symbol} with Hyperliquid`, {
        size: currentSize.toFixed(2),
        entry: state.averageEntryPrice?.toFixed(2) || 'N/A'
      });
    } catch (error) {
      logger.error(`Failed to sync ${symbol} with Hyperliquid`, error);
    }
  }

  /**
   * Handle buy signal with improved validation
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

    // Get account balance with null check
    const accountValue = await this.safeGetAccountValue();
    if (!accountValue || accountValue < 100) {
      logger.error('Insufficient account balance', { accountValue });
      throw new Error('Insufficient account balance');
    }

    // Calculate margin to use
    const marginPercentage = this.config.marginPercentages[state.currentLevel] || 10;
    const marginToUse = accountValue * (marginPercentage / 100);

    // Check max exposure
    const newTotalMargin = (state.totalMarginUsed || 0) + marginToUse;
    if (newTotalMargin > (accountValue * this.config.maxAccountExposure)) {
      logger.warn(`Would exceed max exposure`, {
        current: state.totalMarginUsed || 0,
        new: marginToUse,
        total: newTotalMargin,
        max: accountValue * this.config.maxAccountExposure
      });
      return;
    }

    // Calculate position size
    const positionValue = marginToUse * this.config.fixedLeverage;

    // Get current market price
    const currentPrice = await this.safeGetMarketPrice(signal.symbol);
    if (!currentPrice || currentPrice <= 0) {
      logger.error('Invalid market price', { symbol: signal.symbol, price: currentPrice });
      throw new Error('Cannot get valid market price');
    }

    // Calculate size with proper rounding
    const rawSize = positionValue / currentPrice;
    const sizeInAsset = Math.floor(rawSize * 100) / 100; // Round down to 2 decimals

    if (sizeInAsset < 0.01) {
      logger.warn('Position size too small', { size: sizeInAsset });
      return;
    }

    logger.info(`📈 Adding pyramid level ${state.currentLevel + 1}`, {
      symbol: signal.symbol,
      accountValue: accountValue.toFixed(2),
      marginPercentage: `${marginPercentage}%`,
      marginToUse: marginToUse.toFixed(2),
      leverage: `${this.config.fixedLeverage}x`,
      positionValue: positionValue.toFixed(2),
      currentPrice: currentPrice.toFixed(2),
      size: sizeInAsset.toFixed(2)
    });

    // Place order with proper tick size
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

    const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);

    if (orderResult.status !== 'ok') {
      throw new Error(`Order failed: ${orderResult.error}`);
    }

    logger.info('✅ Buy order placed successfully', { orderResult });

    // Update pyramid state
    state.positions.push({
      size: sizeInAsset,
      entry: currentPrice,
      marginUsed: marginToUse,
      timestamp: new Date()
    });
    state.currentLevel++;
    state.entryCount++;
    state.totalSize = (state.totalSize || 0) + sizeInAsset;
    state.currentSize = state.totalSize;
    state.totalMarginUsed = (state.totalMarginUsed || 0) + marginToUse;
    state.isActive = true;
    state.averageEntryPrice = this.calculateAverageEntry(state.positions);

    // Store in database
    await this.updatePositionInDatabase(userId, signal.symbol, state);
  }

  /**
   * Handle sell signal with SIMPLIFIED 50%/100% strategy
   */
  private async handleSellSignal(
    signal: TradingSignal,
    userId: string,
    state: PyramidState
  ): Promise<void> {
    // Always check Hyperliquid for actual position
    const positions = await this.hyperliquidClient!.getPositions();
    const hlPosition = positions.find(p => p.coin === signal.symbol);

    if (!hlPosition || Math.abs(parseFloat(hlPosition.szi || '0')) < 0.01) {
      logger.info(`No position on Hyperliquid for ${signal.symbol}`);
      // Reset state
      state.currentSize = 0;
      state.exitCount = 0;
      state.isActive = false;
      return;
    }

    const currentSize = Math.abs(parseFloat(hlPosition.szi));
    const entryPrice = parseFloat(hlPosition.entryPx || '0');

    logger.info(`📉 Processing SELL for ${signal.symbol}`, {
      currentSize: currentSize ? currentSize.toFixed(2) : '0',
      entryPrice: entryPrice ? entryPrice.toFixed(2) : '0',
      exitCount: state.exitCount
    });

    // SIMPLIFIED STRATEGY: First sell = 50%, Second sell = 100%
    let exitSize: number;

    if (state.exitCount === 0) {
      // First sell: 50% of position
      exitSize = Math.floor((currentSize * 0.5) * 100) / 100;
      logger.info('🔸 First sell signal - selling 50%', {
        currentSize: currentSize ? currentSize.toFixed(2) : '0',
        exitSize: exitSize ? exitSize.toFixed(2) : '0'
      });
    } else {
      // Second or subsequent sell: close entire position
      exitSize = currentSize;
      logger.info('🔸 Final sell signal - closing entire position', {
        exitSize: exitSize ? exitSize.toFixed(2) : '0'
      });
    }

    if (exitSize < 0.01) {
      logger.warn('Exit size too small', { exitSize });
      return;
    }

    // Place market order to reduce position
    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: false,
      sz: exitSize,
      order_type: 'market',
      reduce_only: true
    };

    logger.info('Placing SELL order', orderRequest);

    const orderResult = await this.hyperliquidClient!.placeOrder(orderRequest);

    if (orderResult.status !== 'ok') {
      throw new Error(`Sell order failed: ${orderResult.error}`);
    }

    logger.info('✅ SELL order executed', {
      symbol: signal.symbol,
      exitSize: exitSize ? exitSize.toFixed(2) : '0',
      exitCount: state.exitCount + 1
    });

    // Update state
    state.exitCount++;
    state.currentSize = Math.max(0, currentSize - exitSize);

    // If position is essentially closed, reset state
    if (state.currentSize < 0.01) {
      logger.info(`Position closed for ${signal.symbol}`);
      state.currentSize = 0;
      state.isActive = false;
      state.exitCount = 0;
      state.currentLevel = 0;
      state.entryCount = 0;
      state.positions = [];

      // Mark as closed in database
      await this.closePositionInDatabase(userId, signal.symbol);
    } else {
      // Update database with reduced position
      await this.updatePositionInDatabase(userId, signal.symbol, state);
    }
  }

  /**
   * Safe wrapper for getting account value
   */
  private async safeGetAccountValue(): Promise<number | null> {
    try {
      if (!this.hyperliquidClient) {
        logger.error('Hyperliquid client not initialized');
        return null;
      }
      const value = await this.hyperliquidClient.getAccountValue();
      return value || 0;
    } catch (error) {
      logger.error('Failed to get account value', error);
      return null;
    }
  }

  /**
   * Safe wrapper for getting market price
   */
  private async safeGetMarketPrice(symbol: string): Promise<number | null> {
    try {
      if (!this.hyperliquidClient) {
        logger.error('Hyperliquid client not initialized');
        return null;
      }
      const price = await this.hyperliquidClient.getMarketPrice(symbol);
      return price || 0;
    } catch (error) {
      logger.error(`Failed to get market price for ${symbol}`, error);
      return null;
    }
  }

  /**
   * Get or create pyramid state
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
        totalMarginUsed: 0,
        isActive: false,
        positions: []
      });
    }
    return this.pyramidStates.get(symbol)!;
  }

  /**
   * Calculate weighted average entry price
   */
  private calculateAverageEntry(positions: Array<{ size: number; entry: number }>): number {
    if (!positions || positions.length === 0) return 0;

    let totalValue = 0;
    let totalSize = 0;

    for (const pos of positions) {
      if (pos && typeof pos.size === 'number' && typeof pos.entry === 'number') {
        totalValue += pos.size * pos.entry;
        totalSize += pos.size;
      }
    }

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
    try {
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol,
          status: 'open'
        }
      });

      const positionData = {
        size: new Decimal(state.currentSize || 0),
        entryPrice: new Decimal(state.averageEntryPrice || 0),
        // Note: pyramid state tracking - no metadata field in schema
        // TODO: Add metadata field to Position model or track separately
      };

      if (existingPosition) {
        await this.prisma.position.update({
          where: { id: existingPosition.id },
          data: positionData
        });
      } else if (state.currentSize > 0) {
        const wallet = await this.walletManager.getActiveWallet(userId);
        if (!wallet) throw new Error('No active wallet');

        await this.prisma.position.create({
          data: {
            userId,
            walletId: wallet.id,
            symbol,
            side: 'long',
            status: 'open',
            ...positionData
          }
        });
      }
    } catch (error) {
      logger.error('Failed to update position in database', error);
    }
  }

  /**
   * Close position in database
   */
  private async closePositionInDatabase(userId: string, symbol: string): Promise<void> {
    try {
      await this.prisma.position.updateMany({
        where: {
          userId,
          symbol,
          status: 'open'
        },
        data: {
          status: 'closed',
          closedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to close position in database', error);
    }
  }

  /**
   * Get default user for initialization
   */
  private async getDefaultUser() {
    return await this.prisma.user.findFirst({
      where: {
        wallets: {
          some: {
            isActive: true
          }
        }
      }
    });
  }

  /**
   * Process signals from queue
   */
  private async processSignals() {
    if (!this.redis) {
      logger.warn('Redis not available, signal processing disabled');
      return;
    }

    this.signalProcessingInterval = setInterval(async () => {
      if (this.isProcessing) return;

      try {
        this.isProcessing = true;
        const signal = await this.redis.lpop('trading:signals');

        if (signal) {
          const parsedSignal = JSON.parse(signal);
          await this.processSignal(parsedSignal.signal, parsedSignal.userId);
        }
      } catch (error) {
        logger.error('Error processing signals from queue', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000);
  }

  /**
   * Monitor positions with regular Hyperliquid sync
   */
  private async monitorPositions() {
    this.positionMonitoringInterval = setInterval(async () => {
      try {
        if (!this.hyperliquidClient) return;

        // Sync all active positions with Hyperliquid
        for (const [symbol, state] of this.pyramidStates.entries()) {
          if (state.isActive) {
            await this.syncPositionWithHyperliquid(symbol);
          }
        }

        // Check for stop losses
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
   * Check position risk (stop loss, trailing stop)
   */
  private async checkPositionRisk(position: Position) {
    if (!this.hyperliquidClient) return;

    try {
      const currentPrice = await this.safeGetMarketPrice(position.symbol);
      if (!currentPrice) return;

      const entryPrice = position.entryPrice.toNumber();
      if (!entryPrice || entryPrice <= 0) return;

      const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Check stop loss
      if (pnlPercentage <= -this.config.stopLossPercentage) {
        logger.warn(`⛔ Stop loss triggered for ${position.symbol}`, {
          pnlPercentage: pnlPercentage.toFixed(2),
          stopLoss: this.config.stopLossPercentage
        });
        await this.emergencyClosePosition(position);
      }
    } catch (error) {
      logger.error(`Error checking risk for ${position.symbol}`, error);
    }
  }

  /**
   * Emergency close position
   */
  private async emergencyClosePosition(position: Position) {
    if (!this.hyperliquidClient) return;

    try {
      const size = position.size.toNumber();
      if (size <= 0) return;

      const orderRequest: OrderRequest = {
        coin: position.symbol,
        is_buy: false,
        sz: size,
        order_type: 'market',
        reduce_only: true
      };

      await this.hyperliquidClient.placeOrder(orderRequest);

      // Update database
      await this.prisma.position.update({
        where: { id: position.id },
        data: {
          status: 'closed',
          closedAt: new Date()
          // Note: closeReason 'stop_loss' - no metadata field in schema
        }
      });

      // Reset state
      this.pyramidStates.delete(position.symbol);

      logger.info(`⛔ Emergency closed position for ${position.symbol}`);
    } catch (error) {
      logger.error(`Failed to emergency close ${position.symbol}`, error);
    }
  }

  /**
   * Health monitoring for Railway deployment
   */
  private startHealthMonitoring() {
    this.healthMonitoringInterval = setInterval(() => {
      this.healthCheckData.lastHealthCheck = new Date();
    }, 30000); // Update every 30 seconds
  }

  /**
   * Get health status
   */
  public getHealthStatus() {
    return {
      ...this.healthCheckData,
      pyramidStates: Array.from(this.pyramidStates.entries()).map(([symbol, state]) => ({
        symbol,
        currentSize: state.currentSize,
        exitCount: state.exitCount,
        lastSync: state.lastSyncTime
      })),
      isReady: this.hyperliquidClient?.isReady() || false
    };
  }

  /**
   * Reset state for symbol
   */
  public resetSymbol(symbol: string): void {
    this.pyramidStates.delete(symbol);
    logger.info(`State reset for ${symbol}`);
  }

  /**
   * Reset all states
   */
  public resetAll(): void {
    this.pyramidStates.clear();
    logger.info('All pyramid states reset');
  }

  /**
   * Get current configuration
   */
  public getConfig(): PyramidConfig {
    return this.config;
  }

  /**
   * Get current states
   */
  public getStates(): Map<string, PyramidState> {
    return this.pyramidStates;
  }

  /**
   * Stop the pyramid trading engine and clean up resources
   */
  public async stop(): Promise<void> {
    logger.info('Stopping pyramid trading engine');

    // Clear all intervals to prevent memory leaks
    if (this.signalProcessingInterval) {
      clearInterval(this.signalProcessingInterval);
      this.signalProcessingInterval = undefined;
    }
    if (this.positionMonitoringInterval) {
      clearInterval(this.positionMonitoringInterval);
      this.positionMonitoringInterval = undefined;
    }
    if (this.healthMonitoringInterval) {
      clearInterval(this.healthMonitoringInterval);
      this.healthMonitoringInterval = undefined;
    }

    logger.info('Pyramid trading engine stopped');
  }
}