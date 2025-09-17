require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function initializePyramidState() {
  try {
    console.log('=== INITIALIZING PYRAMID STATE ===');
    console.log('Current position: 3.03 SOL');
    console.log('Assuming this represents ~3 pyramid levels');
    console.log('With fixed 5x leverage and 10%, 15%, 20% margin allocations');

    // Get the most recent user
    const user = await prisma.user.findFirst({
      where: {
        wallets: {
          some: {
            isActive: true
          }
        }
      }
    });

    if (!user) {
      console.error('No active user found');
      return;
    }

    console.log('Found user:', user.email);

    // Create a signal to track pyramid state
    const pyramidSignal = await prisma.signal.create({
      data: {
        userId: user.id,
        action: 'pyramid_state',
        symbol: 'SOL-PERP',
        status: 'processed',
        strategy: 'pyramid',
        metadata: {
          pyramidLevel: 3,
          entryCount: 3,
          exitCount: 0,
          totalSize: 3.03,
          avgEntryPrice: 236.50,
          totalMarginUsed: 35.89,
          fixedLeverage: 5,
          positions: [
            { level: 1, size: 1.01, entry: 236.25, marginUsed: 11.96, marginPercentage: 10 },
            { level: 2, size: 1.00, entry: 236.75, marginUsed: 11.97, marginPercentage: 15 },
            { level: 3, size: 1.02, entry: 237.55, marginUsed: 11.96, marginPercentage: 20 }
          ],
          initialized: new Date().toISOString(),
          note: 'Initialized with existing 3.03 SOL position'
        }
      }
    });

    console.log('✅ Pyramid state initialized successfully');
    console.log('Signal ID:', pyramidSignal.id);
    console.log('The bot now knows you have 3 pyramid levels active');
    console.log('Next BUY signal will be level 4 (final level with 25% margin)');
    console.log('Next SELL signal will start graduated exit (25% of position)');

    // Also check if there's an open position record
    const openPosition = await prisma.position.findFirst({
      where: {
        userId: user.id,
        symbol: 'SOL-PERP',
        status: 'open'
      }
    });

    if (openPosition) {
      console.log('\nFound open position:', {
        size: openPosition.size,
        entryPrice: openPosition.entryPrice,
        createdAt: openPosition.openedAt
      });

      // Update position metadata with pyramid info
      await prisma.position.update({
        where: { id: openPosition.id },
        data: {
          metadata: {
            ...openPosition.metadata,
            pyramidLevel: 3,
            entryCount: 3,
            fixedLeverage: 5,
            totalMarginUsed: 35.89
          }
        }
      });
      console.log('✅ Updated position metadata with pyramid info');
    } else {
      console.log('\n⚠️ No open position record found in database');
      console.log('Creating position record...');

      const newPosition = await prisma.position.create({
        data: {
          userId: user.id,
          symbol: 'SOL-PERP',
          size: 3.03,
          entryPrice: 236.50,
          currentPrice: 236.50,
          realizedPnl: 0,
          unrealizedPnl: 0,
          status: 'open',
          metadata: {
            pyramidLevel: 3,
            entryCount: 3,
            fixedLeverage: 5,
            totalMarginUsed: 35.89,
            initialized: 'manual'
          }
        }
      });
      console.log('✅ Created position record:', newPosition.id);
    }

  } catch (error) {
    console.error('Error initializing pyramid state:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initializePyramidState();