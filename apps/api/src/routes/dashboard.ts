import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger';
import { JWTPayload, DashboardData, SystemStatus } from '../types';
import { WalletManager } from '../services/wallet-manager';
import { HyperliquidService } from '../services/hyperliquid-client';
import { Decimal } from '@prisma/client/runtime/library';
import { PyramidTradingEngine } from '../services/pyramid-trading-engine';

export async function dashboardRoutes(fastify: FastifyInstance) {
  const walletManager = new WalletManager(fastify.prisma);

  // Middleware to verify JWT
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Get dashboard data
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;

      // Get positions
      const positions = await fastify.prisma.position.findMany({
        where: { userId },
        orderBy: { openedAt: 'desc' },
        take: 50,
      });

      // Get recent trades
      const trades = await fastify.prisma.trade.findMany({
        where: { userId },
        orderBy: { executedAt: 'desc' },
        take: 50,
      });

      // Calculate P&L
      const pnlData = await calculatePnL(fastify.prisma, userId);

      // Get wallet balance
      const wallet = await walletManager.getActiveWallet(userId);
      let balance = {
        total: 0,
        available: 0,
        reserved: 0,
        currency: 'USDC',
      };

      if (wallet) {
        try {
          const privateKey = await walletManager.getDecryptedPrivateKey(wallet.id, userId);
          const hyperliquid = new HyperliquidService({
            apiUrl: wallet.isTestnet
              ? process.env.HYPERLIQUID_API_URL!
              : process.env.HYPERLIQUID_MAINNET_URL!,
            privateKey,
            isTestnet: wallet.isTestnet,
          });
          balance = await hyperliquid.getBalance();
        } catch (error) {
          logger.error('Failed to get balance', error);
        }
      }

      // Get system status
      const systemStatus = await getSystemStatus(fastify);

      const dashboardData: DashboardData = {
        positions: positions.map(p => ({
          ...p,
          side: p.side as 'long' | 'short',
          status: p.status as 'open' | 'closed',
          size: p.size.toNumber(),
          entryPrice: p.entryPrice.toNumber(),
          currentPrice: p.currentPrice?.toNumber(),
          unrealizedPnl: p.unrealizedPnl.toNumber(),
          realizedPnl: p.realizedPnl.toNumber(),
        })),
        trades: trades.map(t => ({
          ...t,
          side: t.side as 'buy' | 'sell',
          type: t.type as 'market' | 'limit',
          status: t.status as 'pending' | 'executed' | 'failed' | 'cancelled',
          size: t.size.toNumber(),
          price: t.price.toNumber(),
          fee: t.fee.toNumber(),
        })),
        pnl: pnlData,
        balance,
        systemStatus,
      };

      return reply.status(200).send(dashboardData);
    } catch (error: any) {
      logger.error('Dashboard error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get dashboard data',
      });
    }
  });

  // Get positions
  fastify.get('/positions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;

      const positions = await fastify.prisma.position.findMany({
        where: { userId },
        orderBy: { openedAt: 'desc' },
        include: {
          trades: {
            orderBy: { executedAt: 'desc' },
          },
        },
      });

      return reply.status(200).send({
        positions: positions.map(p => ({
          ...p,
          size: p.size.toNumber(),
          entryPrice: p.entryPrice.toNumber(),
          currentPrice: p.currentPrice?.toNumber(),
          unrealizedPnl: p.unrealizedPnl.toNumber(),
          realizedPnl: p.realizedPnl.toNumber(),
          trades: p.trades.map(t => ({
            ...t,
            size: t.size.toNumber(),
            price: t.price.toNumber(),
            fee: t.fee.toNumber(),
          })),
        })),
      });
    } catch (error: any) {
      logger.error('Get positions error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get positions',
      });
    }
  });

  // Get trades
  fastify.get('/trades', async (request: FastifyRequest<{
    Querystring: { limit?: number; offset?: number }
  }>, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;
      const { limit = 100, offset = 0 } = request.query;

      const trades = await fastify.prisma.trade.findMany({
        where: { userId },
        orderBy: { executedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          position: {
            select: {
              id: true,
              symbol: true,
              side: true,
            },
          },
          signal: {
            select: {
              id: true,
              action: true,
              strategy: true,
            },
          },
        },
      });

      const total = await fastify.prisma.trade.count({
        where: { userId },
      });

      return reply.status(200).send({
        trades: trades.map(t => ({
          ...t,
          size: t.size.toNumber(),
          price: t.price.toNumber(),
          fee: t.fee.toNumber(),
        })),
        pagination: {
          total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      logger.error('Get trades error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get trades',
      });
    }
  });

  // Get wallet balance
  fastify.get('/wallet/balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;

      const wallet = await walletManager.getActiveWallet(userId);
      if (!wallet) {
        return reply.status(404).send({
          error: 'No active wallet found',
        });
      }

      const privateKey = await walletManager.getDecryptedPrivateKey(wallet.id, userId);
      const hyperliquid = new HyperliquidService({
        apiUrl: wallet.isTestnet
          ? process.env.HYPERLIQUID_API_URL!
          : process.env.HYPERLIQUID_MAINNET_URL!,
        privateKey,
        isTestnet: wallet.isTestnet,
      });

      const balance = await hyperliquid.getBalance();

      return reply.status(200).send(balance);
    } catch (error: any) {
      logger.error('Get balance error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get balance',
      });
    }
  });

  // Close position manually
  fastify.post('/positions/:positionId/close', async (request: FastifyRequest<{
    Params: { positionId: string }
  }>, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;
      const { positionId } = request.params;

      const position = await fastify.prisma.position.findFirst({
        where: {
          id: positionId,
          userId,
          status: 'open',
        },
      });

      if (!position) {
        return reply.status(404).send({
          error: 'Position not found or already closed',
        });
      }

      // Queue close position signal
      await fastify.redis.rpush(
        'trading_signals',
        JSON.stringify({
          signal: {
            action: position.side === 'long' ? 'sell' : 'buy',
            symbol: position.symbol,
            timestamp: Date.now(),
            metadata: { manual: true, positionId },
          },
          userId,
        })
      );

      return reply.status(200).send({
        message: 'Position close request queued',
        positionId,
      });
    } catch (error: any) {
      logger.error('Close position error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to close position',
      });
    }
  });

  // Get system status
  fastify.get('/system/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await getSystemStatus(fastify);
      return reply.status(200).send(status);
    } catch (error: any) {
      logger.error('System status error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get system status',
      });
    }
  });
}

// Helper functions
async function calculatePnL(prisma: any, userId: string) {
  const positions = await prisma.position.findMany({
    where: { userId },
  });

  let totalPnl = 0;
  let todayPnl = 0;
  let unrealizedPnl = 0;
  let realizedPnl = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const position of positions) {
    const pnl = position.unrealizedPnl.toNumber() + position.realizedPnl.toNumber();
    totalPnl += pnl;

    if (position.status === 'open') {
      unrealizedPnl += position.unrealizedPnl.toNumber();
    } else {
      realizedPnl += position.realizedPnl.toNumber();
    }

    if (position.openedAt >= today || (position.closedAt && position.closedAt >= today)) {
      todayPnl += pnl;
    }
  }

  return {
    totalPnl,
    todayPnl,
    unrealizedPnl,
    realizedPnl,
  };
}

async function getSystemStatus(fastify: FastifyInstance): Promise<SystemStatus> {
  const dbConnected = await fastify.prisma.$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);

  const redisConnected = await fastify.redis.ping()
    .then(() => true)
    .catch(() => false);

  // Check if Hyperliquid API is accessible
  let apiConnection = false;
  try {
    const response = await fetch(process.env.HYPERLIQUID_API_URL + '/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    apiConnection = response.ok;
  } catch {
    apiConnection = false;
  }

  const allHealthy = dbConnected && redisConnected && apiConnection;
  const status = allHealthy ? 'healthy' : (dbConnected && redisConnected) ? 'degraded' : 'down';

  return {
    status,
    lastUpdate: new Date(),
    apiConnection,
    databaseConnection: dbConnected,
    redisConnection: redisConnected,
  };
}

  // Pyramid status endpoint
  fastify.get('/pyramid/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pyramidEngine = (fastify as any).pyramidEngine;

      if (!pyramidEngine) {
        return reply.status(503).send({
          error: 'Pyramid engine not available'
        });
      }

      // Get pyramid states
      const states = pyramidEngine.getStates();

      return reply.status(200).send({
        enabled: true,
        config: pyramidEngine.getConfig(),
        states: Object.fromEntries(states),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Error getting pyramid status', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get pyramid status'
      });
    }
  });

  // Reset pyramid state endpoint
  fastify.post('/pyramid/reset', async (request: FastifyRequest<{
    Body: { symbol?: string }
  }>, reply: FastifyReply) => {
    try {
      const { symbol } = request.body;
      const pyramidEngine = (fastify as any).pyramidEngine;

      if (!pyramidEngine) {
        return reply.status(503).send({
          error: 'Pyramid engine not available'
        });
      }

      if (symbol) {
        // Reset specific symbol
        pyramidEngine.resetSymbol(symbol);
        logger.info(`Pyramid state reset for ${symbol}`);
      } else {
        // Reset all states
        pyramidEngine.resetAll();
        logger.info('All pyramid states reset');
      }

      return reply.status(200).send({
        success: true,
        message: symbol ? `State reset for ${symbol}` : 'All states reset',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Error resetting pyramid state', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to reset pyramid state'
      });
    }
  });
}