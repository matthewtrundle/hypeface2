import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from './lib/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const app = Fastify({
  logger: false, // We use winston for logging
});

async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connected successfully');

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
    const { TradingEngine } = await import('./services/trading-engine');
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
    const tradingEngine = new TradingEngine(prisma, redis, wsService);

    // Start trading engine
    await tradingEngine.start();

    // Health check endpoint
    app.get('/health', async () => {
      const dbConnected = await prisma.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false);

      const redisConnected = await redis.ping()
        .then(() => true)
        .catch(() => false);

      const status = dbConnected && redisConnected ? 'healthy' : 'degraded';

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