import { Hyperliquid } from 'hyperliquid';
import { ethers } from 'ethers';
import { logger } from '../lib/logger';

export interface HyperliquidConfig {
  privateKey: string;
  isTestnet: boolean;
}

export interface Position {
  coin: string;
  szi: string; // size (positive for long, negative for short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: string;
}

export interface OrderRequest {
  coin: string;
  is_buy: boolean;
  sz: number;
  limit_px?: number;
  order_type: 'limit' | 'market';
  reduce_only?: boolean;
}

export interface OrderResponse {
  status: 'ok' | 'error';
  response?: {
    type: 'order';
    data: {
      statuses: Array<{ filled: { totalSz: string; avgPx: string } | { resting: { oid: number } } }>;
    };
  };
  error?: string;
}

export class HyperliquidClient {
  private client: Hyperliquid | null = null;
  private wallet: ethers.Wallet | null = null;
  private isInitialized = false;

  constructor(private config: HyperliquidConfig) {}

  async initialize() {
    try {
      if (!this.config.privateKey || this.config.privateKey === 'encrypted-private-key-placeholder') {
        logger.warn('Hyperliquid client not initialized - no valid private key configured');
        return false;
      }

      this.wallet = new ethers.Wallet(this.config.privateKey);

      this.client = new Hyperliquid({
        privateKey: this.config.privateKey,
        testnet: this.config.isTestnet,
      });

      this.isInitialized = true;
      logger.info('Hyperliquid client initialized', {
        address: this.wallet.address,
        testnet: this.config.isTestnet,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to initialize Hyperliquid client', { error: error.message });
      return false;
    }
  }

  async getAccountValue(): Promise<number> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const clearinghouseState = await this.client.info.perpetuals.getClearinghouseState(
        this.wallet!.address
      );

      // DEBUG: Log all available balance information
      logger.info('💰 HYPERLIQUID BALANCE DEBUG', {
        accountValue: clearinghouseState.marginSummary.accountValue,
        totalMarginUsed: clearinghouseState.marginSummary.totalMarginUsed,
        totalNtlPos: clearinghouseState.marginSummary.totalNtlPos,
        totalRawUsd: clearinghouseState.marginSummary.totalRawUsd,
        withdrawable: clearinghouseState.withdrawable,
        fullMarginSummary: clearinghouseState.marginSummary
      });

      const accountValue = parseFloat(clearinghouseState.marginSummary.accountValue);
      return accountValue;
    } catch (error: any) {
      logger.error('Failed to get account value', { error: error.message });
      throw error;
    }
  }

  async getPositions(): Promise<Position[]> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const clearinghouseState = await this.client.info.perpetuals.getClearinghouseState(
        this.wallet!.address
      );

      return clearinghouseState.assetPositions.map((pos: any) => ({
        coin: pos.position.coin,
        szi: pos.position.szi,
        entryPx: pos.position.entryPx,
        positionValue: pos.position.positionValue,
        unrealizedPnl: pos.position.unrealizedPnl,
        returnOnEquity: pos.position.returnOnEquity,
        leverage: pos.position.leverage,
      }));
    } catch (error: any) {
      logger.error('Failed to get positions', { error: error.message });
      throw error;
    }
  }

  async setLeverage(coin: string, leverageMode: 'cross' | 'isolated', leverage: number): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      logger.info(`Setting leverage for ${coin}`, { leverageMode, leverage });

      // Get asset index from meta endpoint
      const meta = await this.client.info.perpetuals.getMeta();
      const assetIndex = meta.universe.findIndex((asset: any) => asset.name === coin);

      if (assetIndex === -1) {
        throw new Error(`Asset ${coin} not found in universe`);
      }

      logger.info(`Found asset index for ${coin}`, { assetIndex });

      // The Hyperliquid SDK updateLeverage method signature:
      // updateLeverage(asset: number, isCross: boolean, leverage: number)
      const updateLeverageResult = await (this.client.exchange as any).updateLeverage(
        assetIndex,                  // asset index (e.g., 0 for BTC, 1 for ETH)
        leverageMode === 'cross',    // is_cross: true for cross margin, false for isolated
        leverage                      // leverage amount (e.g., 5 for 5x)
      );

      logger.info('Leverage updated successfully', { result: updateLeverageResult });
      return updateLeverageResult;
    } catch (error: any) {
      logger.error('Failed to update leverage', {
        error: error.message,
        coin,
        leverageMode,
        leverage
      });
      throw error;
    }
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      // Ensure sz is valid
      if (!order.sz && order.sz !== 0) {
        throw new Error(`Invalid order size: ${order.sz}`);
      }

      const formattedSize = typeof order.sz === 'number'
        ? order.sz.toFixed(8).replace(/\.?0+$/, '') // Remove trailing zeros
        : order.sz;

      // IMPORTANT: Hyperliquid SDK doesn't have true market orders
      // Market orders are implemented as aggressive limit orders with Ioc (Immediate or Cancel)
      // We need to calculate a slippage price for "market" orders

      let limitPrice: number;

      if (order.order_type === 'market') {
        // For market orders, we need to get the current price and add slippage
        const currentPrice = await this.getMarketPrice(order.coin);
        const slippage = 0.05; // 5% slippage for market orders (aggressive to ensure fill)

        // Apply slippage: higher price for buys, lower for sells
        limitPrice = order.is_buy
          ? currentPrice * (1 + slippage)
          : currentPrice * (1 - slippage);

        // Round to appropriate decimals (SOL uses 2 decimals for price)
        limitPrice = Math.round(limitPrice * 100) / 100;

        logger.info(`Market order: Using slippage price ${limitPrice} (current: ${currentPrice})`);
      } else if (order.limit_px) {
        limitPrice = order.limit_px;
      } else {
        throw new Error('Limit price required for limit orders');
      }

      // Build order request according to SDK requirements
      const orderParams: any = {
        coin: order.coin,
        is_buy: order.is_buy,
        sz: formattedSize,
        limit_px: limitPrice, // ALWAYS required by SDK
        order_type: { limit: { tif: 'Ioc' } }, // Use Ioc for market-like behavior
        reduce_only: order.reduce_only || false,
      };

      const result = await this.client.exchange.placeOrder(orderParams);

      logger.info('Order placed', { order, result });

      return {
        status: 'ok',
        response: result,
      };
    } catch (error: any) {
      logger.error('Failed to place order', { error: error.message, stack: error.stack, order });
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  async cancelOrder(coin: string, orderId: number): Promise<boolean> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const result = await this.client.exchange.cancelOrder({
        coin,
        o: orderId,
      });

      logger.info('Order cancelled', { coin, orderId, result });
      return true;
    } catch (error: any) {
      logger.error('Failed to cancel order', { error: error.message, coin, orderId });
      return false;
    }
  }

  async closePosition(coin: string): Promise<boolean> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const positions = await this.getPositions();
      const position = positions.find(p => p.coin === coin);

      if (!position) {
        logger.warn('No position found to close', { coin });
        return false;
      }

      const size = Math.abs(parseFloat(position.szi));
      const isBuy = parseFloat(position.szi) < 0; // Buy to close short, sell to close long

      logger.info(`Closing position for ${coin}`, {
        size: size.toFixed(4),
        direction: isBuy ? 'buy' : 'sell'
      });

      const result = await this.placeOrder({
        coin,
        is_buy: isBuy,
        sz: size,
        order_type: 'market',
        reduce_only: true,
      });

      return result.status === 'ok';
    } catch (error: any) {
      logger.error('Failed to close position', { error: error.message, coin });
      return false;
    }
  }

  /**
   * Alternative method to close position using SDK's marketClose
   * This handles slippage calculation internally
   */
  async closePositionWithMarketClose(coin: string, size?: number, slippage: number = 0.05): Promise<boolean> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      // The SDK's marketClose method handles all the complexity
      const result = await (this.client as any).custom.marketClose(
        coin,
        size,     // optional size, if not provided closes entire position
        undefined, // optional price
        slippage  // slippage percentage (0.05 = 5%)
      );

      logger.info('Position closed using marketClose', { coin, result });
      return true;
    } catch (error: any) {
      logger.error('Failed to close position with marketClose', { error: error.message, coin });
      return false;
    }
  }

  async getMarketPrice(coin: string): Promise<number> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const allMids = await (this.client.info as any).getAllMids();
      const price = parseFloat(allMids[coin]);

      if (!price || isNaN(price)) {
        throw new Error(`Price not found for ${coin}`);
      }

      return price;
    } catch (error: any) {
      logger.error('Failed to get market price', { error: error.message, coin });
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getWalletAddress(): string | null {
    return this.wallet?.address || null;
  }
}