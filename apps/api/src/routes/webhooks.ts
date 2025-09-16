import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { verifyWebhookSignature } from '../lib/encryption';
import { logger } from '../lib/logger';
import { TradingSignal, WebhookPayload } from '../types';
import { PyramidTradingEngine } from '../services/pyramid-trading-engine';

const webhookSchema = Joi.object({
  action: Joi.string().valid('buy', 'sell').required(),
  symbol: Joi.string().required(),
  price: Joi.number().required(),
  strategy: Joi.string().optional(),
  confidence: Joi.number().optional(),
  leverage: Joi.number().optional(),
  timestamp: Joi.number().optional(),
  metadata: Joi.object().optional(),
});

interface WebhookRequest extends FastifyRequest {
  body: WebhookPayload;
  headers: {
    'x-webhook-signature'?: string;
    'x-webhook-timestamp'?: string;
  };
}

export async function webhookRoutes(fastify: FastifyInstance) {
  // TradingView webhook endpoint
  fastify.post('/tradingview', async (request: WebhookRequest, reply: FastifyReply) => {
    let userId: string | null = null; // Declare userId outside try block

    try {
      const signature = request.headers['x-webhook-signature'];
      const timestamp = request.headers['x-webhook-timestamp'];
      const payload = request.body;

      // Log incoming webhook
      logger.info('Webhook received', {
        action: payload.action,
        symbol: payload.symbol,
        strategy: payload.strategy,
      });

      // Verify timestamp (prevent replay attacks)
      if (timestamp) {
        const requestTime = parseInt(timestamp);
        const currentTime = Date.now();
        const timeDiff = Math.abs(currentTime - requestTime);

        // Reject if older than 5 minutes
        if (timeDiff > 5 * 60 * 1000) {
          logger.warn('Webhook timestamp expired', { timeDiff });
          return reply.status(401).send({
            error: 'Webhook timestamp expired',
          });
        }
      }

      // Simple secret check for TradingView (which can't do signatures)
      const webhookSecret = process.env.WEBHOOK_SECRET;
      const urlSecret = (request.query as any).secret;

      if (webhookSecret) {
        if (urlSecret !== webhookSecret) {
          logger.warn('Invalid webhook secret');
          return reply.status(401).send({
            error: 'Invalid secret',
          });
        }
      }

      // Validate webhook payload
      const { error, value } = webhookSchema.validate(payload);
      if (error) {
        logger.warn('Invalid webhook payload', { error: error.details });
        return reply.status(400).send({
          error: 'Invalid payload',
          details: error.details,
        });
      }

      // Create trading signal
      const signal: TradingSignal = {
        action: value.action,
        symbol: value.symbol,
        timestamp: value.timestamp || Date.now(),
        strategy: value.strategy,
        metadata: value.metadata,
      };

      // Get user ID from webhook or use default user
      userId = await getUserIdFromWebhook(fastify, payload);

      if (!userId) {
        logger.error('No user found for webhook');
        return reply.status(400).send({
          error: 'User not configured',
        });
      }

      // Store signal in database
      const savedSignal = await fastify.prisma.signal.create({
        data: {
          userId,
          action: signal.action,
          symbol: signal.symbol,
          strategy: signal.strategy,
          metadata: signal.metadata,
          status: 'pending',
        },
      });

      // Process signal immediately with PyramidTradingEngine
      const pyramidEngine = new PyramidTradingEngine(
        fastify.prisma,
        fastify.redis,
        fastify.wsService
      );

      try {
        // Process the signal with pyramid strategy
        await pyramidEngine.processSignal(
          { ...signal, id: savedSignal.id, price: value.price },
          userId
        );

        // Update signal status to processed
        await fastify.prisma.signal.update({
          where: { id: savedSignal.id },
          data: { status: 'processed', processedAt: new Date() }
        });
      } catch (processingError: any) {
        // Update signal status to failed
        await fastify.prisma.signal.update({
          where: { id: savedSignal.id },
          data: {
            status: 'failed',
            metadata: {
              ...savedSignal.metadata,
              error: processingError.message,
              errorTime: new Date().toISOString()
            }
          }
        });
        throw processingError;
      }

      logger.info('Signal processed with pyramid strategy', {
        signalId: savedSignal.id,
        action: signal.action,
        symbol: signal.symbol,
        price: value.price
      });

      return reply.status(200).send({
        success: true,
        signalId: savedSignal.id,
        message: 'Signal processed with pyramid strategy',
      });

    } catch (error: any) {
      logger.error('Webhook processing error', {
        error: error.message,
        stack: error.stack,
        userId
      });
      return reply.status(500).send({
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // Test webhook endpoint (development only)
  if (process.env.NODE_ENV !== 'production') {
    fastify.post('/test', async (request: WebhookRequest, reply: FastifyReply) => {
      try {
        const payload = request.body;

        // Validate webhook payload
        const { error, value } = webhookSchema.validate(payload);
        if (error) {
          return reply.status(400).send({
            error: 'Invalid payload',
            details: error.details,
          });
        }

        // Get test user
        const testUser = await fastify.prisma.user.findFirst({
          where: {
            email: 'test@example.com',
          },
        });

        if (!testUser) {
          return reply.status(400).send({
            error: 'Test user not found. Please run seed script.',
          });
        }

        // Create trading signal
        const signal: TradingSignal = {
          action: value.action,
          symbol: value.symbol,
          timestamp: Date.now(),
          strategy: value.strategy || 'test',
          metadata: { ...value.metadata, test: true },
        };

        // Store signal in database
        const savedSignal = await fastify.prisma.signal.create({
          data: {
            userId: testUser.id,
            action: signal.action,
            symbol: signal.symbol,
            strategy: signal.strategy,
            metadata: signal.metadata,
            status: 'pending',
          },
        });

        // Process test signal with PyramidTradingEngine
        const pyramidEngine = new PyramidTradingEngine(
          fastify.prisma,
          fastify.redis,
          fastify.wsService
        );

        await pyramidEngine.processSignal(
          { ...signal, id: savedSignal.id, price: value.price },
          testUser.id
        );

        // Update signal status
        await fastify.prisma.signal.update({
          where: { id: savedSignal.id },
          data: { status: 'processed', processedAt: new Date() }
        });

        logger.info('Test signal processed with pyramid', {
          signalId: savedSignal.id,
          action: signal.action,
          symbol: signal.symbol,
        });

        return reply.status(200).send({
          success: true,
          signalId: savedSignal.id,
          message: 'Test signal processed with pyramid strategy',
          testMode: true,
        });

      } catch (error: any) {
        logger.error('Test webhook error', { error: error.message });
        return reply.status(500).send({
          error: 'Internal server error',
        });
      }
    });
  }

  // Webhook status endpoint
  fastify.get('/status/:signalId', async (request: FastifyRequest<{
    Params: { signalId: string }
  }>, reply: FastifyReply) => {
    try {
      const { signalId } = request.params;

      const signal = await fastify.prisma.signal.findUnique({
        where: {
          id: signalId,
        },
        include: {
          trades: true,
        },
      });

      if (!signal) {
        return reply.status(404).send({
          error: 'Signal not found',
        });
      }

      return reply.status(200).send({
        signal,
        processed: signal.status === 'processed',
        trades: signal.trades.length,
      });

    } catch (error: any) {
      logger.error('Error fetching signal status', { error: error.message });
      return reply.status(500).send({
        error: 'Internal server error',
      });
    }
  });
}

// Helper function to get user ID from webhook
async function getUserIdFromWebhook(
  fastify: FastifyInstance,
  payload: WebhookPayload
): Promise<string | null> {
  // Option 1: Get from webhook metadata
  if (payload.metadata?.userId) {
    return payload.metadata.userId;
  }

  // Option 2: Get from strategy mapping (configure in database)
  if (payload.strategy) {
    // TODO: Implement strategy-to-user mapping
  }

  // Option 3: Use default active user (for single-user setup)
  const defaultUser = await fastify.prisma.user.findFirst({
    where: {
      wallets: {
        some: {
          isActive: true,
        },
      },
    },
  });

  return defaultUser?.id || null;
}