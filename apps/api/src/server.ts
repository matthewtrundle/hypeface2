import 'dotenv/config';
import { app } from './app';
import { logger } from './lib/logger';

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

    await app.listen({ port, host });

    logger.info(`Server listening on ${host}:${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Health check: http://${host}:${port}/health`);
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

start();