import { PrismaClient, Position, Signal } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { TradingSignal } from '../types';
import { HyperliquidClient, OrderRequest, Position as PositionInfo } from './hyperliquid-client';
import { WalletManager } from './wallet-manager';
import { WebSocketService } from './websocket';

export interface TradingConfig {
  positionSizePercentage: number;
  maxLeverage: number;
  stopLossPercentage?: number;
  takeProfitPercentage?: number;
}

export class TradingEngine {
  private isProcessing = false;
  private hyperliquidClient: HyperliquidClient | null = null;
  private walletManager: WalletManager;
  private config: TradingConfig;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private wsService: WebSocketService
  ) {
    this.walletManager = new WalletManager(prisma);
    this.config = {
      positionSizePercentage: parseFloat(process.env.POSITION_SIZE_PERCENTAGE || '10'),
      maxLeverage: parseFloat(process.env.MAX_LEVERAGE || '10'),
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '5'),
      takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE || '10'),
    };
  }

  async start() {
    logger.info('Starting trading engine');

    // Start signal processing loop
    this.processSignals();

    // Start position monitoring
    this.monitorPositions();

    logger.info('Trading engine started');
  }

  async initializeHyperliquid(userId: string): Promise<HyperliquidClient> {
    const wallet = await this.walletManager.getActiveWallet(userId);

    if (!wallet) {
      throw new Error('No active wallet found');
    }

    const privateKey = await this.walletManager.getDecryptedPrivateKey(wallet.id, userId);

    return new HyperliquidClient({
      privateKey,
      isTestnet: wallet.isTestnet
    });
  }

  async processSignal(signal: TradingSignal, userId: string): Promise<void> {
    try {
      logger.info('Processing signal', { signal, userId });

      // Initialize Hyperliquid client for user
      this.hyperliquidClient = await this.initializeHyperliquid(userId);

      // Get current position
      const currentPosition = await this.getCurrentPosition(userId, signal.symbol);
      const positions = await this.hyperliquidClient!.getPositions();
      const hyperliquidPosition = positions.find(p => p.coin === signal.symbol) || null;

      if (signal.action === 'buy') {
        await this.processBuySignal(signal, userId, currentPosition, hyperliquidPosition);
      } else if (signal.action === 'sell') {
        await this.processSellSignal(signal, userId, currentPosition, hyperliquidPosition);
      }

      // Mark signal as processed
      if (signal.id) {
        await this.prisma.signal.update({
          where: { id: signal.id },
          data: {
            status: 'processed',
            processedAt: new Date()
          },
        });
      }

      logger.info('Signal processed successfully', { signalId: signal.id });

    } catch (error: any) {
      logger.error('Error processing signal', {
        error: error.message,
        signal,
        userId
      });

      if (signal.id) {
        await this.prisma.signal.update({
          where: { id: signal.id },
          data: { status: 'failed' },
        });
      }

      throw error;
    }
  }

  private async processBuySignal(
    signal: TradingSignal,
    userId: string,
    currentPosition: Position | null,
    hyperliquidPosition: PositionInfo | null
  ): Promise<void> {
    // Only open long if no position exists
    if (!currentPosition || currentPosition.status === 'closed') {
      await this.openLongPosition(signal, userId);
    } else {
      logger.info('Position already exists, skipping buy signal', {
        positionId: currentPosition.id,
        symbol: signal.symbol
      });
    }
  }

  private async processSellSignal(
    signal: TradingSignal,
    userId: string,
    currentPosition: Position | null,
    hyperliquidPosition: PositionInfo | null
  ): Promise<void> {
    // Only close long position if it exists
    if (currentPosition?.side === 'long' || (hyperliquidPosition && parseFloat(hyperliquidPosition.szi) > 0)) {
      await this.closePosition(currentPosition, userId, signal.symbol);
    } else {
      logger.info('No long position to close', {
        symbol: signal.symbol
      });
    }
  }

  private async openLongPosition(signal: TradingSignal, userId: string): Promise<Position> {
    const wallet = await this.walletManager.getActiveWallet(userId);
    if (!wallet) throw new Error('No active wallet');

    const positionSize = await this.calculatePositionSize(userId, signal.symbol);

    // Set leverage - removed as it's not needed with the new client

    // Place buy order
    const orderRequest: OrderRequest = {
      coin: signal.symbol,
      is_buy: true,
      sz: positionSize,
      limit_px: 0, // Market order
      order_type: 'market',
      reduce_only: false
    };

    const orderResponse = await this.hyperliquidClient!.placeOrder(orderRequest);

    if (orderResponse.status !== 'ok') {
      throw new Error(`Failed to open long position: ${orderResponse.error}`);
    }

    // Create position record
    const position = await this.prisma.position.create({
      data: {
        userId,
        walletId: wallet.id,
        symbol: signal.symbol,
        side: 'long',
        size: new Decimal(positionSize),
        entryPrice: new Decimal(0 /* orderResponse.fillPrice */ || 0),
        status: 'open',
      },
    });

    // Create trade record
    await this.prisma.trade.create({
      data: {
        userId,
        positionId: position.id,
        signalId: signal.id,
        symbol: signal.symbol,
        side: 'buy',
        type: 'market',
        size: new Decimal(positionSize),
        price: new Decimal(0 /* orderResponse.fillPrice */ || 0),
        fee: new Decimal(0 /* orderResponse.fee */ || 0),
        hyperliquidOrderId: '', // Will be updated from actual response
        status: 'executed',
      },
    });

    // Broadcast update
    this.wsService.broadcastPositionUpdate(userId, position);

    logger.info('Long position opened', {
      position: position.id,
      symbol: signal.symbol,
      size: positionSize,
      price: 0 /* orderResponse.fillPrice */
    });

    return position;
  }

  // Removed openShortPosition as we're only trading longs now

  private async closePosition(
    position: Position | null,
    userId: string,
    symbol: string
  ): Promise<void> {
    // Get actual position from Hyperliquid
    const positions = await this.hyperliquidClient!.getPositions();
    const hyperliquidPosition = positions.find(p => p.coin === symbol) || null;

    if (!hyperliquidPosition || parseFloat(hyperliquidPosition.szi) === 0) {
      logger.info('No position to close', { symbol });
      return;
    }

    const positionSize = Math.abs(parseFloat(hyperliquidPosition.szi));

    // We only have long positions now, so we sell to close
    if (parseFloat(hyperliquidPosition.szi) <= 0) {
      logger.info('No long position to close', { symbol, size: hyperliquidPosition.szi });
      return;
    }

    // Place closing order (sell to close long)
    const orderRequest: OrderRequest = {
      coin: symbol,
      is_buy: false, // Always sell to close long
      sz: positionSize,
      limit_px: 0, // Market order
      order_type: 'market',
      reduce_only: true
    };

    const orderResponse = await this.hyperliquidClient!.placeOrder(orderRequest);

    if (orderResponse.status !== 'ok') {
      throw new Error(`Failed to close position: ${orderResponse.error}`);
    }

    // Update position if exists in database
    if (position) {
      const realizedPnl = this.calculateRealizedPnl(
        position,
        0 /* orderResponse.fillPrice */ || 0
      );

      const updatedPosition = await this.prisma.position.update({
        where: { id: position.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          realizedPnl: new Decimal(realizedPnl),
        },
      });

      // Create closing trade record (always sell for closing long)
      await this.prisma.trade.create({
        data: {
          userId,
          positionId: position.id,
          symbol,
          side: 'sell', // Always sell to close long
          type: 'market',
          size: new Decimal(positionSize),
          price: new Decimal(0 /* orderResponse.fillPrice */ || 0),
          fee: new Decimal(0 /* orderResponse.fee */ || 0),
          hyperliquidOrderId: '', // Will be updated from actual response
          status: 'executed',
        },
      });

      // Broadcast update
      this.wsService.broadcastPositionUpdate(userId, updatedPosition);

      logger.info('Position closed', {
        position: position.id,
        realizedPnl,
        closePrice: 0 /* orderResponse.fillPrice */
      });
    }
  }

  private async getCurrentPosition(userId: string, symbol: string): Promise<Position | null> {
    return this.prisma.position.findFirst({
      where: {
        userId,
        symbol,
        status: 'open',
      },
    });
  }

  private async calculatePositionSize(userId: string, symbol: string): Promise<number> {
    const balance = await this.hyperliquidClient!.getBalance();
    const currentPrice = await this.hyperliquidClient!.getCurrentPrice(symbol);

    // Use configured percentage of available balance
    const positionValue = (balance.available * this.config.positionSizePercentage) / 100;

    // Apply leverage
    const leveragedValue = positionValue * this.config.maxLeverage;

    // Calculate position size in units
    const positionSize = leveragedValue / currentPrice;

    logger.info('Position size calculated', {
      balance: balance.available,
      percentage: this.config.positionSizePercentage,
      leverage: this.config.maxLeverage,
      currentPrice,
      positionSize,
    });

    return positionSize;
  }

  private calculateRealizedPnl(position: Position, exitPrice: number): number {
    const entryPrice = position.entryPrice.toNumber();
    const size = position.size.toNumber();

    // Only long positions now
    const priceDiff = exitPrice - entryPrice;
    return priceDiff * size;
  }

  private calculateUnrealizedPnl(position: Position, currentPrice: number): number {
    const entryPrice = position.entryPrice.toNumber();
    const size = position.size.toNumber();

    // Only long positions now
    const priceDiff = currentPrice - entryPrice;
    return priceDiff * size;
  }

  private async processSignals(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      // Get pending signals from Redis queue
      const signalData = await this.redis.lpop('trading_signals');

      if (signalData) {
        const { signal, userId } = JSON.parse(signalData);
        await this.processSignal(signal, userId);
      }
    } catch (error) {
      logger.error('Error processing signals', error);
    } finally {
      this.isProcessing = false;

      // Schedule next processing
      setTimeout(() => this.processSignals(), 1000);
    }
  }

  private async monitorPositions(): Promise<void> {
    try {
      const openPositions = await this.prisma.position.findMany({
        where: { status: 'open' },
      });

      for (const position of openPositions) {
        await this.updatePositionPnl(position);
      }
    } catch (error) {
      logger.error('Error monitoring positions', error);
    } finally {
      // Schedule next monitoring
      setTimeout(() => this.monitorPositions(), 5000);
    }
  }

  private async updatePositionPnl(position: Position): Promise<void> {
    try {
      // Initialize Hyperliquid for this user
      const hyperliquid = await this.initializeHyperliquid(position.userId);
      const currentPrice = await hyperliquid.getCurrentPrice(position.symbol);
      const unrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);

      const updatedPosition = await this.prisma.position.update({
        where: { id: position.id },
        data: {
          currentPrice: new Decimal(currentPrice),
          unrealizedPnl: new Decimal(unrealizedPnl),
        },
      });

      // Broadcast update if significant change (>1% or >$10)
      const pnlChange = Math.abs(unrealizedPnl - position.unrealizedPnl.toNumber());
      if (pnlChange > 10 || pnlChange / Math.abs(position.unrealizedPnl.toNumber()) > 0.01) {
        this.wsService.broadcastPositionUpdate(position.userId, updatedPosition);
      }
    } catch (error) {
      logger.error('Error updating position P&L', {
        error,
        positionId: position.id
      });
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping trading engine');
    // Cleanup tasks if needed
  }
}