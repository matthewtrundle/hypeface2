const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearPositions() {
  try {
    console.log('Clearing all open positions from database...');

    // Update all open positions to closed
    const result = await prisma.position.updateMany({
      where: {
        status: 'open'
      },
      data: {
        status: 'closed',
        closedAt: new Date()
      }
    });

    console.log(`Closed ${result.count} open positions`);

    // Also clear any pending signals
    const signalResult = await prisma.signal.updateMany({
      where: {
        status: 'pending'
      },
      data: {
        status: 'cancelled'
      }
    });

    console.log(`Cancelled ${signalResult.count} pending signals`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

clearPositions();