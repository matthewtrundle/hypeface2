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
      const clearinghouseState = await this.client.info.clearinghouseState({
        user: this.wallet!.address,
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
      const clearinghouseState = await this.client.info.clearinghouseState({
        user: this.wallet!.address,
      });

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

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const orderType = order.order_type === 'market'
        ? { market: {} }
        : { limit: { tif: 'Gtc' } };

      const result = await this.client.exchange.placeOrder({
        coin: order.coin,
        is_buy: order.is_buy,
        sz: order.sz,
        limit_px: order.limit_px || null,
        order_type: orderType,
        reduce_only: order.reduce_only || false,
      });

      logger.info('Order placed', { order, result });

      return {
        status: 'ok',
        response: result,
      };
    } catch (error: any) {
      logger.error('Failed to place order', { error: error.message, order });
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

  async getMarketPrice(coin: string): Promise<number> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Hyperliquid client not initialized');
    }

    try {
      const allMids = await this.client.info.getAllMids();
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