const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSignals() {
  try {
    // Get recent signals
    const signals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { email: true } }
      }
    });

    console.log('\n=== Recent Signals ===');
    signals.forEach(signal => {
      console.log(`\n${new Date(signal.createdAt).toLocaleString()}`);
      console.log(`  Signal ID: ${signal.id}`);
      console.log(`  Action: ${signal.action} | Symbol: ${signal.symbol}`);
      console.log(`  Status: ${signal.status}`);
      console.log(`  User: ${signal.user.email}`);
      if (signal.processedAt) {
        console.log(`  Processed: ${new Date(signal.processedAt).toLocaleString()}`);
      }
      if (signal.metadata) {
        console.log(`  Metadata:`, signal.metadata);
      }
    });

    // Get recent trades
    const trades = await prisma.trade.findMany({
      orderBy: { executedAt: 'desc' },
      take: 10
    });

    console.log('\n=== Recent Trades ===');
    if (trades.length === 0) {
      console.log('  No trades found');
    } else {
      trades.forEach(trade => {
        console.log(`\n${new Date(trade.executedAt).toLocaleString()}`);
        console.log(`  Trade ID: ${trade.id}`);
        console.log(`  Symbol: ${trade.symbol} | Side: ${trade.side}`);
        console.log(`  Size: ${trade.size} @ ${trade.executionPrice}`);
        console.log(`  Status: ${trade.status}`);
      });
    }

    // Get current positions
    const positions = await prisma.position.findMany({
      where: { status: 'open' }
    });

    console.log('\n=== Current Open Positions ===');
    if (positions.length === 0) {
      console.log('  No open positions');
    } else {
      positions.forEach(pos => {
        console.log(`\n  Symbol: ${pos.symbol}`);
        console.log(`  Side: ${pos.side} | Size: ${pos.size}`);
        console.log(`  Entry: ${pos.entryPrice}`);
        console.log(`  Opened: ${new Date(pos.openedAt).toLocaleString()}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSignals();
