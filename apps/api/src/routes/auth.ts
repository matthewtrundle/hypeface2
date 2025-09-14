import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger';
import { JWTPayload } from '../types';
import Joi from 'joi';

// Hardcoded credentials for single-user setup
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'hyperliquid2024';

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

interface AuthRequest extends FastifyRequest {
  body: {
    username: string;
    password: string;
  };
}

export async function authRoutes(fastify: FastifyInstance) {
  // Simple login endpoint
  fastify.post('/login', async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const { error, value } = loginSchema.validate(request.body);
      if (error) {
        return reply.status(400).send({
          error: 'Invalid input',
          details: error.details,
        });
      }

      const { username, password } = value;

      // Check hardcoded credentials
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return reply.status(401).send({
          error: 'Invalid credentials',
        });
      }

      // Find or create the admin user
      let user = await fastify.prisma.user.findFirst({
        where: { email: 'admin@hyperliquid.local' },
      });

      if (!user) {
        user = await fastify.prisma.user.create({
          data: {
            email: 'admin@hyperliquid.local',
            passwordHash: 'hardcoded', // Not used for validation
          },
        });
      }

      // Generate JWT token
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      } as JWTPayload);

      logger.info('Admin logged in', { userId: user.id });

      return reply.status(200).send({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    } catch (error: any) {
      logger.error('Login error', { error: error.message });
      return reply.status(500).send({
        error: 'Login failed',
      });
    }
  });

  // Get current user endpoint
  fastify.get('/me', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as JWTPayload;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallets: {
            select: {
              id: true,
              name: true,
              publicKey: true,
              isTestnet: true,
              isActive: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: 'User not found',
        });
      }

      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          wallets: user.wallets,
        },
      });
    } catch (error: any) {
      logger.error('Get user error', { error: error.message });
      return reply.status(500).send({
        error: 'Failed to get user',
      });
    }
  });

  // Logout endpoint (simple)
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      message: 'Logged out successfully',
    });
  });
}