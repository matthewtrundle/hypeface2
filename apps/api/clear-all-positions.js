const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAllPositions() {
  try {
    console.log('=== CLEARING ALL POSITION DATA ===');
    console.log('This will clean up testnet data that\'s interfering with mainnet\n');

    // Clear all open positions
    const positions = await prisma.position.updateMany({
      where: {
        status: 'open'
      },
      data: {
        status: 'closed',
        closedAt: new Date()
      }
    });
    console.log(`✅ Closed ${positions.count} open positions`);

    // Clear all pending signals
    const signals = await prisma.signal.updateMany({
      where: {
        status: 'pending'
      },
      data: {
        status: 'cancelled'
      }
    });
    console.log(`✅ Cancelled ${signals.count} pending signals`);

    // Delete all trades (optional - removes history)
    // const trades = await prisma.trade.deleteMany({});
    // console.log(`✅ Deleted ${trades.count} trade records`);

    console.log('\n=== DATABASE CLEANED ===');
    console.log('The bot will start fresh on mainnet');
    console.log('Old testnet position data has been cleared');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

clearAllPositions();