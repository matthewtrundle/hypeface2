import { Decimal } from '@prisma/client/runtime/library';

export interface TradingSignal {
  id?: string;
  action: 'buy' | 'sell';
  symbol: string;
  price?: number;
  timestamp: number;
  strategy?: string;
  metadata?: Record<string, any>;
}

export interface Position {
  id: string;
  userId: string;
  walletId: string;
  symbol: string;
  side: 'long' | 'short';
  size: Decimal | number;
  entryPrice: Decimal | number;
  currentPrice?: Decimal | number;
  unrealizedPnl: Decimal | number;
  realizedPnl: Decimal | number;
  status: 'open' | 'closed';
  openedAt: Date;
  closedAt?: Date;
}

export interface Trade {
  id: string;
  userId: string;
  positionId?: string;
  signalId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  size: Decimal | number;
  price: Decimal | number;
  fee: Decimal | number;
  hyperliquidOrderId?: string;
  status: 'pending' | 'executed' | 'failed' | 'cancelled';
  executedAt: Date;
}

export interface WalletBalance {
  total: number;
  available: number;
  reserved: number;
  currency: string;
}

export interface DashboardData {
  positions: Position[];
  pnl: {
    totalPnl: number;
    todayPnl: number;
    unrealizedPnl: number;
    realizedPnl: number;
  };
  balance: WalletBalance;
  trades: Trade[];
  systemStatus: SystemStatus;
}

export interface SystemStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastUpdate: Date;
  apiConnection: boolean;
  databaseConnection: boolean;
  redisConnection: boolean;
}

export interface WebhookPayload {
  action: 'buy' | 'sell';
  symbol: string;
  price?: number;
  strategy?: string;
  confidence?: number;
  leverage?: number;
  timestamp?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface HyperliquidOrder {
  coin: string;
  is_buy: boolean;
  sz: number;
  limit_px?: number;
  order_type: any;
  reduce_only: boolean;
}

export interface HyperliquidOrderResponse {
  status: string;
  response: {
    type: string;
    data?: {
      statuses: Array<{
        filled: {
          totalSz: string;
          avgPx: string;
        };
      }>;
    };
  };
}