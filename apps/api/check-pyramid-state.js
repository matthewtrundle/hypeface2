require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function checkState() {
  try {
    // Get recent signals (pyramid states are stored in metadata)
    const pyramidSignals = await prisma.signal.findMany({
      where: {
        action: 'pyramid_state'
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log('=== PYRAMID STATE SIGNALS ===');
    pyramidSignals.forEach(signal => {
      console.log({
        id: signal.id,
        symbol: signal.symbol,
        status: signal.status,
        metadata: signal.metadata,
        createdAt: signal.createdAt
      });
    });

    // Get recent signals
    const signals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('\n=== RECENT SIGNALS ===');
    signals.forEach(signal => {
      console.log({
        action: signal.action,
        symbol: signal.symbol,
        status: signal.status,
        createdAt: signal.createdAt,
        error: signal.metadata?.error || null
      });
    });

    // Get open positions
    const positions = await prisma.position.findMany({
      where: { status: 'open' }
    });

    console.log('\n=== OPEN POSITIONS ===');
    positions.forEach(position => {
      console.log({
        symbol: position.symbol,
        size: position.size,
        entryPrice: position.entryPrice,
        status: position.status,
        openedAt: position.openedAt
      });
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkState();
