// Check users and wallets in database
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkUsers() {
  const prisma = new PrismaClient();

  try {
    console.log('=== DATABASE USER AND WALLET CHECK ===\n');

    // Check users
    const users = await prisma.user.findMany({
      include: {
        wallets: true
      }
    });

    console.log(`Found ${users.length} users:`);
    users.forEach((user, i) => {
      console.log(`  ${i + 1}. ID: ${user.id}`);
      console.log(`     Email: ${user.email || 'N/A'}`);
      console.log(`     Created: ${user.createdAt}`);
      console.log(`     Wallets: ${user.wallets.length}`);
      user.wallets.forEach((wallet, j) => {
        console.log(`       ${j + 1}. Address: ${wallet.address}`);
        console.log(`          Active: ${wallet.isActive}`);
        console.log(`          Testnet: ${wallet.isTestnet}`);
      });
      console.log();
    });

    // Check standalone wallets
    const allWallets = await prisma.wallet.findMany();
    console.log(`\nTotal wallets in database: ${allWallets.length}`);

    // Check for active wallets
    const activeWallets = await prisma.wallet.findMany({
      where: { isActive: true }
    });
    console.log(`Active wallets: ${activeWallets.length}`);

    if (activeWallets.length === 0) {
      console.log('\n⚠️  NO ACTIVE WALLETS FOUND');
      console.log('This explains why getUserIdFromWebhook returns null');
      console.log('You need to either:');
      console.log('1. Create a user with an active wallet');
      console.log('2. Set an existing wallet to active');
      console.log('3. Modify webhook handler to use environment wallet directly');
    }

  } catch (error) {
    console.error('Error checking database:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();