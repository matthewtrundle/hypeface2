import 'dotenv/config';
import Fastify from 'fastify';
// Deployment trigger: Fixed MASTER_ENCRYPTION_KEY requirement
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from './lib/logger';

const prisma = new PrismaClient();

// Initialize Redis with better error handling
let redis = null;
try {
  // Use fallback to localhost if REDIS_URL is not available or invalid
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn('Redis connection failed, continuing without Redis');
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError: (err) => {
      logger.error('Redis reconnection error:', err.message);
      return false;
    }
  });
} catch (error) {
  logger.warn('Redis initialization failed, continuing without Redis');
}

const app = Fastify({
  logger: false, // We use winston for logging
});

async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Test Redis connection (optional)
    if (redis) {
      try {
        await redis.ping();
        logger.info('Redis connected successfully');
      } catch (error) {
        logger.warn('Redis ping failed, continuing without Redis:', error.message);
        redis = null; // Disable Redis if not available
      }
    }

    // Register plugins
    await app.register(cors, {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    });

    await app.register(jwt, {
      secret: process.env.JWT_SECRET || 'change-this-secret',
    });

    await app.register(websocket);

    // Decorate Fastify instance with prisma and redis
    app.decorate('prisma', prisma);
    app.decorate('redis', redis);

    // Import and register routes
    const { authRoutes } = await import('./routes/auth');
    const { dashboardRoutes } = await import('./routes/dashboard');
    const { webhookRoutes } = await import('./routes/webhooks');
    const { PyramidTradingEngine } = await import('./services/pyramid-trading-engine');
    const { WebSocketService } = await import('./services/websocket');
    const { Server } = await import('socket.io');
    const { createServer } = await import('http');

    // Register routes
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(dashboardRoutes, { prefix: '/api' });
    await app.register(webhookRoutes, { prefix: '/webhooks' });

    // Setup WebSocket
    const server = createServer();
    const io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
    });

    const wsService = new WebSocketService(io, prisma);
    app.decorate('wsService', wsService);

    // Initialize Hyperliquid client if private key is configured
    const { HyperliquidClient } = await import('./services/hyperliquid-client');
    let hyperliquidClient = null;

    // Debug: Log wallet key status
    logger.info('Wallet private key check', {
      hasKey: !!process.env.WALLET_PRIVATE_KEY,
      keyLength: process.env.WALLET_PRIVATE_KEY?.length || 0,
      firstChars: process.env.WALLET_PRIVATE_KEY?.substring(0, 4) || 'none'
    });

    if (process.env.WALLET_PRIVATE_KEY && process.env.WALLET_PRIVATE_KEY !== 'encrypted-private-key-placeholder') {
      hyperliquidClient = new HyperliquidClient({
        privateKey: process.env.WALLET_PRIVATE_KEY,
        isTestnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
      });

      const initialized = await hyperliquidClient.initialize();
      if (initialized) {
        logger.info('Hyperliquid client initialized successfully', {
          address: hyperliquidClient.getWalletAddress(),
          testnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
        });
      } else {
        logger.warn('Hyperliquid client failed to initialize');
        hyperliquidClient = null;
      }
    } else {
      logger.warn('No wallet private key configured - trading disabled');
    }

    app.decorate('hyperliquidClient', hyperliquidClient);

    // Use PyramidTradingEngine if pyramiding is enabled
    const enablePyramiding = process.env.ENABLE_PYRAMIDING === 'true';

    if (enablePyramiding) {
      const pyramidEngine = new PyramidTradingEngine(prisma, redis, wsService);
      if (hyperliquidClient) {
        pyramidEngine.setHyperliquidClient(hyperliquidClient);
      }
      await pyramidEngine.start();
      app.decorate('pyramidEngine', pyramidEngine);
      logger.info('Pyramid trading engine started');
    } else {
      const { TradingEngine } = await import('./services/trading-engine');
      const tradingEngine = new TradingEngine(prisma, redis, wsService);
      await tradingEngine.start();
      app.decorate('tradingEngine', tradingEngine);
      logger.info('Standard trading engine started');
    }

    // Health check endpoint
    app.get('/health', async () => {
      const dbConnected = await prisma.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false);

      const redisConnected = redis ? await redis.ping()
        .then(() => true)
        .catch(() => false) : false;

      // Consider healthy if database is connected (Redis is optional)
      const status = dbConnected ? 'healthy' : 'unhealthy';

      return {
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbConnected,
          redis: redisConnected,
        },
      };
    });

    // Basic root endpoint
    app.get('/', async () => {
      return {
        name: 'Hyperliquid Trading Bot API',
        version: '1.0.0',
        status: 'running'
      };
    });

    // Error handler
    app.setErrorHandler(async (error, request, reply) => {
      logger.error('Request error', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method
      });

      const statusCode = error.statusCode || 500;
      const message = statusCode === 500 ? 'Internal Server Error' : error.message;

      reply.status(statusCode).send({
        error: message,
        statusCode,
        timestamp: new Date().toISOString(),
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
      await app.close();
      await prisma.$disconnect();
      await redis.quit();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

    await app.listen({ port, host });
    logger.info(`Server listening on ${host}:${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Hyperliquid API: ${process.env.HYPERLIQUID_API_URL || 'Not configured'}`);

  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

// Declare module to add custom properties to Fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }
}

main();

export { app };