import { ethers } from 'ethers';
import { InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { logger } from '../lib/logger';
import { WalletBalance } from '../types';

export interface HyperliquidConfig {
  apiUrl: string;
  privateKey: string;
  isTestnet: boolean;
}

export interface OrderRequest {
  coin: string;
  isBuy: boolean;
  size: number;
  limitPrice?: number;
  reduceOnly?: boolean;
  orderType?: 'market' | 'limit';
}

export interface OrderResponse {
  status: 'success' | 'failed';
  orderId?: string;
  fillPrice?: number;
  fillSize?: number;
  fee?: number;
  error?: string;
}

export interface PositionInfo {
  coin: string;
  szi: number; // signed size (positive for long, negative for short)
  entryPx: number;
  markPx: number;
  unrealizedPnl: number;
  realizedPnl: number;
  marginUsed: number;
  leverage: number;
}

export class HyperliquidService {
  private infoClient: InfoClient;
  private exchangeClient: ExchangeClient;
  private wallet: ethers.Wallet;
  private isTestnet: boolean;

  constructor(config: HyperliquidConfig) {
    this.isTestnet = config.isTestnet;
    this.wallet = new ethers.Wallet(config.privateKey);

    // Initialize Info Client
    this.infoClient = new InfoClient(config.apiUrl);

    // Initialize Exchange Client with viem wallet adapter
    this.exchangeClient = new ExchangeClient(
      this.wallet,
      config.isTestnet
    );

    logger.info('Hyperliquid service initialized', {
      address: this.wallet.address,
      isTestnet: config.isTestnet,
    });
  }

  async getBalance(): Promise<WalletBalance> {
    try {
      const userState = await this.infoClient.perpetuals.getUserState({
        user: this.wallet.address,
      });

      const crossMarginSummary = userState.crossMarginSummary;
      const totalValue = parseFloat(crossMarginSummary.accountValue);
      const marginUsed = parseFloat(crossMarginSummary.marginUsed);
      const available = totalValue - marginUsed;

      return {
        total: totalValue,
        available: available,
        reserved: marginUsed,
        currency: 'USDC',
      };
    } catch (error) {
      logger.error('Failed to get balance', { error });
      throw new Error('Failed to fetch wallet balance');
    }
  }

  async placeOrder(request: OrderRequest): Promise<OrderResponse> {
    try {
      const orderType = request.orderType || 'market';

      const orderRequest = {
        coin: request.coin,
        is_buy: request.isBuy,
        sz: request.size,
        limit_px: orderType === 'limit' ? request.limitPrice : undefined,
        order_type: orderType === 'limit'
          ? { limit: { tif: 'Gtc' } }
          : { market: {} },
        reduce_only: request.reduceOnly || false,
      };

      const result = await this.exchangeClient.placeOrder(orderRequest);

      if (result.status === 'ok' && result.response.type === 'order') {
        const orderData = result.response.data;
        const status = orderData.statuses[0];

        if (status.filled) {
          return {
            status: 'success',
            orderId: status.resting?.oid,
            fillPrice: parseFloat(status.filled.avgPx),
            fillSize: parseFloat(status.filled.totalSz),
            fee: 0, // Calculate fee based on exchange rules
          };
        }
      }

      return {
        status: 'failed',
        error: 'Order placement failed',
      };
    } catch (error: any) {
      logger.error('Failed to place order', { error, request });
      return {
        status: 'failed',
        error: error.message || 'Unknown error',
      };
    }
  }

  async cancelOrder(orderId: string, coin: string): Promise<boolean> {
    try {
      const result = await this.exchangeClient.cancelOrder({
        coin,
        o: orderId,
      });

      return result.status === 'ok';
    } catch (error) {
      logger.error('Failed to cancel order', { error, orderId, coin });
      return false;
    }
  }

  async cancelAllOrders(coin?: string): Promise<boolean> {
    try {
      const result = await this.exchangeClient.cancelOrder({
        coin: coin || undefined,
      });

      return result.status === 'ok';
    } catch (error) {
      logger.error('Failed to cancel all orders', { error, coin });
      return false;
    }
  }

  async getOpenOrders(coin?: string) {
    try {
      const openOrders = await this.infoClient.perpetuals.getUserOpenOrders({
        user: this.wallet.address,
      });

      if (coin) {
        return openOrders.filter(order => order.coin === coin);
      }

      return openOrders;
    } catch (error) {
      logger.error('Failed to get open orders', { error });
      return [];
    }
  }

  async getPositions(): Promise<PositionInfo[]> {
    try {
      const userState = await this.infoClient.perpetuals.getUserState({
        user: this.wallet.address,
      });

      return userState.assetPositions.map(pos => ({
        coin: pos.position.coin,
        szi: parseFloat(pos.position.szi),
        entryPx: parseFloat(pos.position.entryPx || '0'),
        markPx: parseFloat(pos.position.markPx || '0'),
        unrealizedPnl: parseFloat(pos.position.unrealizedPnl || '0'),
        realizedPnl: parseFloat(pos.position.cumFunding?.allTime || '0'),
        marginUsed: parseFloat(pos.position.marginUsed || '0'),
        leverage: parseFloat(pos.position.leverage?.value || '1'),
      }));
    } catch (error) {
      logger.error('Failed to get positions', { error });
      return [];
    }
  }

  async getPosition(coin: string): Promise<PositionInfo | null> {
    const positions = await this.getPositions();
    return positions.find(p => p.coin === coin) || null;
  }

  async getCurrentPrice(coin: string): Promise<number> {
    try {
      const allMids = await this.infoClient.spot.getAllMids();
      const price = allMids[coin];

      if (!price) {
        throw new Error(`Price not found for ${coin}`);
      }

      return parseFloat(price);
    } catch (error) {
      logger.error('Failed to get current price', { error, coin });
      throw error;
    }
  }

  async getOrderBook(coin: string) {
    try {
      const l2Book = await this.infoClient.perpetuals.getL2Book({
        coin,
      });

      return {
        bids: l2Book.levels[0].map(level => ({
          price: parseFloat(level.px),
          size: parseFloat(level.sz),
        })),
        asks: l2Book.levels[1].map(level => ({
          price: parseFloat(level.px),
          size: parseFloat(level.sz),
        })),
      };
    } catch (error) {
      logger.error('Failed to get order book', { error, coin });
      throw error;
    }
  }

  async getTradeHistory(coin?: string, limit = 100) {
    try {
      const fills = await this.infoClient.perpetuals.getUserFills({
        user: this.wallet.address,
      });

      let trades = fills;

      if (coin) {
        trades = trades.filter(fill => fill.coin === coin);
      }

      return trades.slice(0, limit).map(fill => ({
        coin: fill.coin,
        side: fill.side,
        price: parseFloat(fill.px),
        size: parseFloat(fill.sz),
        fee: parseFloat(fill.fee),
        timestamp: fill.time,
        orderId: fill.oid,
      }));
    } catch (error) {
      logger.error('Failed to get trade history', { error });
      return [];
    }
  }

  async setLeverage(coin: string, leverage: number): Promise<boolean> {
    try {
      const result = await this.exchangeClient.updateLeverage({
        coin,
        leverage,
        is_cross: true, // Use cross margin
      });

      return result.status === 'ok';
    } catch (error) {
      logger.error('Failed to set leverage', { error, coin, leverage });
      return false;
    }
  }

  async getAccountInfo() {
    try {
      const userState = await this.infoClient.perpetuals.getUserState({
        user: this.wallet.address,
      });

      return {
        address: this.wallet.address,
        accountValue: parseFloat(userState.crossMarginSummary.accountValue),
        totalMarginUsed: parseFloat(userState.crossMarginSummary.marginUsed),
        totalUnrealizedPnl: parseFloat(userState.crossMarginSummary.totalUnrealizedPnl),
        availableBalance: parseFloat(userState.crossMarginSummary.accountValue) -
                         parseFloat(userState.crossMarginSummary.marginUsed),
      };
    } catch (error) {
      logger.error('Failed to get account info', { error });
      throw error;
    }
  }

  async getFundingRate(coin: string) {
    try {
      const fundingHistory = await this.infoClient.perpetuals.getFundingHistory({
        coin,
        startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
      });

      if (fundingHistory.length > 0) {
        const latestFunding = fundingHistory[fundingHistory.length - 1];
        return {
          rate: parseFloat(latestFunding.fundingRate),
          nextFundingTime: latestFunding.time + 8 * 60 * 60 * 1000, // 8 hours
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get funding rate', { error, coin });
      return null;
    }
  }
}