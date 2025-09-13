import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/encryption';
import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('Starting database seed...');

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: await hashPassword('testpassword'),
    },
  });

  logger.info('Test user created', { userId: testUser.id });

  // Create test wallet (placeholder)
  const testWallet = await prisma.wallet.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000000',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000000',
      userId: testUser.id,
      name: 'Test Wallet',
      publicKey: '0x0000000000000000000000000000000000000000',
      encryptedPrivateKey: 'placeholder-encrypted-key',
      isTestnet: true,
      isActive: true,
    },
  });

  logger.info('Test wallet created', { walletId: testWallet.id });

  logger.info('Database seed completed successfully');
}

main()
  .catch((e) => {
    logger.error('Error seeding database', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });