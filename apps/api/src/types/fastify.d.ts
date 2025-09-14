import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { WebSocketService } from '../services/websocket';
import { PyramidTradingEngine } from '../services/pyramid-trading-engine';
import { TradingEngine } from '../services/trading-engine';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis | null;
    wsService: WebSocketService;
    pyramidEngine?: PyramidTradingEngine;
    tradingEngine?: TradingEngine;
  }
}