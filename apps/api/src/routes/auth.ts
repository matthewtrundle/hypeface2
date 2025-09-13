import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/encryption';
import { logger } from '../lib/logger';
import { JWTPayload } from '../types';
import Joi from 'joi';

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

interface AuthRequest extends FastifyRequest {
  body: {
    email: string;
    password: string;
  };
}

export async function authRoutes(fastify: FastifyInstance) {
  // Register endpoint
  fastify.post('/register', async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const { error, value } = registerSchema.validate(request.body);
      if (error) {
        return reply.status(400).send({
          error: 'Invalid input',
          details: error.details,
        });
      }

      const { email, password } = value;

      // Check if user already exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(409).send({
          error: 'User already exists',
        });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await fastify.prisma.user.create({
        data: {
          email,
          passwordHash,
        },
      });

      // Generate JWT token
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      } as JWTPayload);

      logger.info('User registered', { userId: user.id, email });

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    } catch (error: any) {
      logger.error('Registration error', { error: error.message });
      return reply.status(500).send({
        error: 'Registration failed',
      });
    }
  });

  // Login endpoint
  fastify.post('/login', async (request: AuthRequest, reply: FastifyReply) => {
    try {
      const { error, value } = loginSchema.validate(request.body);
      if (error) {
        return reply.status(400).send({
          error: 'Invalid input',
          details: error.details,
        });
      }

      const { email, password } = value;

      // Find user
      const user = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return reply.status(401).send({
          error: 'Invalid credentials',
        });
      }

      // Generate JWT token
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
      } as JWTPayload);

      // Store session in Redis
      await fastify.redis.setex(
        `session:${user.id}`,
        86400, // 24 hours
        JSON.stringify({
          userId: user.id,
          email: user.email,
          loginAt: new Date().toISOString(),
        })
      );

      logger.info('User logged in', { userId: user.id, email });

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

  // Logout endpoint
  fastify.post('/logout', {
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

      // Remove session from Redis
      await fastify.redis.del(`session:${userId}`);

      logger.info('User logged out', { userId });

      return reply.status(200).send({
        message: 'Logged out successfully',
      });
    } catch (error: any) {
      logger.error('Logout error', { error: error.message });
      return reply.status(500).send({
        error: 'Logout failed',
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

  // Refresh token endpoint
  fastify.post('/refresh', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, email } = request.user as JWTPayload;

      // Generate new token
      const token = fastify.jwt.sign({
        userId,
        email,
      } as JWTPayload);

      // Update session in Redis
      await fastify.redis.setex(
        `session:${userId}`,
        86400, // 24 hours
        JSON.stringify({
          userId,
          email,
          refreshedAt: new Date().toISOString(),
        })
      );

      return reply.status(200).send({
        token,
      });
    } catch (error: any) {
      logger.error('Token refresh error', { error: error.message });
      return reply.status(500).send({
        error: 'Token refresh failed',
      });
    }
  });
}