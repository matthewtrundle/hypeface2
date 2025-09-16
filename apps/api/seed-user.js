const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedUser() {
  try {
    console.log('Creating default user for trading...');

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: 'trader@hyperliquid.bot' }
    });

    if (existingUser) {
      console.log('User already exists:', existingUser.id);
      return;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email: 'trader@hyperliquid.bot',
        name: 'Trading Bot',
        wallets: {
          create: {
            address: '0x3D57aF0FeccD210726B5C94E71C6596251EF1339',
            encryptedPrivateKey: process.env.WALLET_PRIVATE_KEY || 'encrypted_key',
            isActive: true,
            isTestnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
          }
        }
      },
      include: {
        wallets: true
      }
    });

    console.log('User created successfully:');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Wallet:', user.wallets[0].address);
    console.log('  Testnet:', user.wallets[0].isTestnet);

  } catch (error) {
    console.error('Error creating user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedUser();