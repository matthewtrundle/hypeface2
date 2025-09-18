import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../lib/logger';
import os from 'os';
import fs from 'fs';
import path from 'path';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  buildTime: string;
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    database: boolean;
    redis: boolean;
    hyperliquid: boolean;
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      loadAverage: number[];
    };
  };
  trading: {
    lastSignalProcessed: string | null;
    activePositions: number;
    errors: string[];
  };
  deployment: {
    commitHash: string;
    deploymentId: string;
    region: string;
  };
}

export async function healthRoutes(fastify: FastifyInstance) {
  // Enhanced health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      // Get build version and deployment info
      const version = process.env.BUILD_VERSION ||
                     process.env.RAILWAY_DEPLOYMENT_ID ||
                     process.env.COMMIT_SHA ||
                     Date.now().toString();

      const buildTime = process.env.BUILD_TIME || new Date().toISOString();
      const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID || 'local';
      const commitHash = process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
      const region = process.env.RAILWAY_REGION || 'unknown';

      // Check database connectivity
      let dbHealthy = false;
      try {
        await fastify.prisma.$queryRaw`SELECT 1`;
        dbHealthy = true;
      } catch (error) {
        logger.error('Database health check failed', error);
      }

      // Check Redis connectivity
      let redisHealthy = false;
      if (fastify.redis) {
        try {
          await fastify.redis.ping();
          redisHealthy = true;
        } catch (error) {
          logger.error('Redis health check failed', error);
        }
      }

      // Check Hyperliquid connectivity
      let hyperliquidHealthy = false;
      try {
        // Check if pyramid engine exists and is ready
        const pyramidEngine = (fastify as any).pyramidEngine;
        if (pyramidEngine && pyramidEngine.getHealthStatus) {
          const engineHealth = pyramidEngine.getHealthStatus();
          hyperliquidHealthy = engineHealth.isReady;
        }
      } catch (error) {
        logger.error('Hyperliquid health check failed', error);
      }

      // Get trading engine status
      let tradingStatus = {
        lastSignalProcessed: null as string | null,
        activePositions: 0,
        errors: [] as string[]
      };

      try {
        const pyramidEngine = (fastify as any).pyramidEngine;
        if (pyramidEngine && pyramidEngine.getHealthStatus) {
          const engineHealth = pyramidEngine.getHealthStatus();
          tradingStatus = {
            lastSignalProcessed: engineHealth.lastSignalProcessed?.toISOString() || null,
            activePositions: engineHealth.pyramidStates?.length || 0,
            errors: engineHealth.errors || []
          };
        }

        // Also get active positions from database
        const activePositions = await fastify.prisma.position.count({
          where: { status: 'open' }
        });
        tradingStatus.activePositions = Math.max(tradingStatus.activePositions, activePositions);
      } catch (error) {
        logger.error('Failed to get trading status', error);
      }

      // Calculate system metrics
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPercentage = (usedMemory / totalMemory) * 100;

      // Determine overall health status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!dbHealthy || !hyperliquidHealthy) {
        overallStatus = 'unhealthy';
      } else if (!redisHealthy || memoryPercentage > 90 || tradingStatus.errors.length > 5) {
        overallStatus = 'degraded';
      }

      const response: HealthCheckResponse = {
        status: overallStatus,
        version,
        buildTime,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: dbHealthy,
          redis: redisHealthy,
          hyperliquid: hyperliquidHealthy
        },
        system: {
          memory: {
            used: usedMemory,
            total: totalMemory,
            percentage: memoryPercentage
          },
          cpu: {
            loadAverage: os.loadavg()
          }
        },
        trading: tradingStatus,
        deployment: {
          commitHash,
          deploymentId,
          region
        }
      };

      // Add response time
      const responseTime = Date.now() - startTime;

      // Set appropriate status code
      const statusCode = overallStatus === 'healthy' ? 200 :
                         overallStatus === 'degraded' ? 200 : 503;

      // Add cache control headers to prevent caching
      reply.headers({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Response-Time': `${responseTime}ms`,
        'X-Build-Version': version
      });

      return reply.status(statusCode).send(response);

    } catch (error: any) {
      logger.error('Health check failed', { error: error.message });

      // Return unhealthy status on error
      return reply.status(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Liveness probe (simple check that service is running)
  fastify.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.headers({
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    return reply.status(200).send({ status: 'alive' });
  });

  // Readiness probe (check if service is ready to accept traffic)
  fastify.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check database is accessible
      await fastify.prisma.$queryRaw`SELECT 1`;

      reply.headers({
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      return reply.status(200).send({ status: 'ready' });
    } catch (error) {
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  // Version endpoint
  fastify.get('/version', async (request: FastifyRequest, reply: FastifyReply) => {
    const version = {
      version: process.env.BUILD_VERSION || 'unknown',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown',
      branch: process.env.RAILWAY_GIT_BRANCH || 'unknown',
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    };

    reply.headers({
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    return reply.status(200).send(version);
  });

  // Metrics endpoint (for monitoring)
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          openConnections: await fastify.prisma.$queryRaw`SELECT count(*) FROM pg_stat_activity`
        },
        trading: {
          totalSignals: await fastify.prisma.signal.count(),
          processedSignals: await fastify.prisma.signal.count({ where: { status: 'processed' } }),
          failedSignals: await fastify.prisma.signal.count({ where: { status: 'failed' } }),
          openPositions: await fastify.prisma.position.count({ where: { status: 'open' } }),
          totalTrades: await fastify.prisma.trade.count()
        }
      };

      reply.headers({
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });

      return reply.status(200).send(metrics);
    } catch (error: any) {
      logger.error('Failed to generate metrics', error);
      return reply.status(500).send({ error: 'Failed to generate metrics' });
    }
  });
}