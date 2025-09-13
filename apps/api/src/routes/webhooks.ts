import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { verifyWebhookSignature } from '../lib/encryption';
import { logger } from '../lib/logger';
import { TradingSignal, WebhookPayload } from '../types';

const webhookSchema = Joi.object({
  action: Joi.string().valid('buy', 'sell').required(),
  symbol: Joi.string().required(),
  strategy: Joi.string().optional(),
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

      // Verify signature
      const webhookSecret = process.env.WEBHOOK_SECRET;
      if (webhookSecret && signature) {
        const payloadString = JSON.stringify(payload);
        const isValid = verifyWebhookSignature(payloadString, signature, webhookSecret);

        if (!isValid) {
          logger.warn('Invalid webhook signature');
          return reply.status(401).send({
            error: 'Invalid signature',
          });
        }
      } else if (process.env.NODE_ENV === 'production') {
        // In production, signature is required
        logger.warn('Missing webhook signature in production');
        return reply.status(401).send({
          error: 'Signature required',
        });
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

      // TODO: Get user ID from webhook or use default user
      // For now, we'll use a placeholder approach
      const userId = await getUserIdFromWebhook(fastify, payload);

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

      // Queue signal for processing
      await fastify.redis.rpush(
        'trading_signals',
        JSON.stringify({
          signal: { ...signal, id: savedSignal.id },
          userId,
        })
      );

      logger.info('Signal queued for processing', {
        signalId: savedSignal.id,
        action: signal.action,
        symbol: signal.symbol,
      });

      return reply.status(200).send({
        success: true,
        signalId: savedSignal.id,
        message: 'Signal received and queued for processing',
      });

    } catch (error: any) {
      logger.error('Webhook processing error', { error: error.message });
      return reply.status(500).send({
        error: 'Internal server error',
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

        // Queue signal for processing
        await fastify.redis.rpush(
          'trading_signals',
          JSON.stringify({
            signal: { ...signal, id: savedSignal.id },
            userId: testUser.id,
          })
        );

        logger.info('Test signal queued', {
          signalId: savedSignal.id,
          action: signal.action,
          symbol: signal.symbol,
        });

        return reply.status(200).send({
          success: true,
          signalId: savedSignal.id,
          message: 'Test signal queued for processing',
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