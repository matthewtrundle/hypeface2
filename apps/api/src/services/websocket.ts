import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
}

export class WebSocketService {
  private io: Server;
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(io: Server, private prisma: PrismaClient) {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.userId;
        socket.email = decoded.email;

        // Track user socket
        this.addUserSocket(decoded.userId, socket.id);

        logger.info('WebSocket client authenticated', {
          userId: decoded.userId,
          socketId: socket.id
        });

        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', error);
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        userId: socket.userId
      });

      // Join user room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
      }

      // Subscribe to specific channels
      socket.on('subscribe', (channels: string[]) => {
        channels.forEach(channel => {
          socket.join(channel);
          logger.debug('Socket subscribed to channel', {
            socketId: socket.id,
            channel
          });
        });
      });

      // Unsubscribe from channels
      socket.on('unsubscribe', (channels: string[]) => {
        channels.forEach(channel => {
          socket.leave(channel);
          logger.debug('Socket unsubscribed from channel', {
            socketId: socket.id,
            channel
          });
        });
      });

      // Request current positions
      socket.on('get:positions', async () => {
        if (!socket.userId) return;

        try {
          const positions = await this.prisma.position.findMany({
            where: {
              userId: socket.userId,
              status: 'open'
            },
            orderBy: {
              openedAt: 'desc'
            }
          });

          socket.emit('positions:update', positions);
        } catch (error) {
          logger.error('Error fetching positions', error);
          socket.emit('error', {
            message: 'Failed to fetch positions'
          });
        }
      });

      // Request recent trades
      socket.on('get:trades', async (limit: number = 50) => {
        if (!socket.userId) return;

        try {
          const trades = await this.prisma.trade.findMany({
            where: {
              userId: socket.userId
            },
            orderBy: {
              executedAt: 'desc'
            },
            take: limit
          });

          socket.emit('trades:update', trades);
        } catch (error) {
          logger.error('Error fetching trades', error);
          socket.emit('error', {
            message: 'Failed to fetch trades'
          });
        }
      });

      // Request account balance
      socket.on('get:balance', async () => {
        if (!socket.userId) return;

        try {
          // Get active wallet
          const wallet = await this.prisma.wallet.findFirst({
            where: {
              userId: socket.userId,
              isActive: true
            }
          });

          if (wallet) {
            // TODO: Get actual balance from Hyperliquid
            const balance = {
              total: 10000,
              available: 9000,
              reserved: 1000,
              currency: 'USDC'
            };

            socket.emit('balance:update', balance);
          }
        } catch (error) {
          logger.error('Error fetching balance', error);
          socket.emit('error', {
            message: 'Failed to fetch balance'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (socket.userId) {
          this.removeUserSocket(socket.userId, socket.id);
        }
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  private removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  // Broadcast methods for real-time updates
  broadcastPositionUpdate(userId: string, position: any) {
    this.io.to(`user:${userId}`).emit('position:update', position);
    logger.debug('Position update broadcasted', {
      userId,
      positionId: position.id
    });
  }

  broadcastTradeExecuted(userId: string, trade: any) {
    this.io.to(`user:${userId}`).emit('trade:executed', trade);
    logger.debug('Trade execution broadcasted', {
      userId,
      tradeId: trade.id
    });
  }

  broadcastBalanceUpdate(userId: string, balance: any) {
    this.io.to(`user:${userId}`).emit('balance:update', balance);
    logger.debug('Balance update broadcasted', { userId });
  }

  broadcastSystemStatus(status: any) {
    this.io.emit('system:status', status);
    logger.debug('System status broadcasted', { status });
  }

  broadcastAlert(userId: string, alert: {
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    details?: any;
  }) {
    this.io.to(`user:${userId}`).emit('alert', alert);
    logger.info('Alert broadcasted', {
      userId,
      type: alert.type,
      message: alert.message
    });
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  // Get all connected socket IDs for a user
  getUserSockets(userId: string): string[] {
    const sockets = this.userSockets.get(userId);
    return sockets ? Array.from(sockets) : [];
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}