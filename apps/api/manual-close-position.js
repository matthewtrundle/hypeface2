const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');
require('dotenv').config();

async function manualClosePosition() {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey);

  const client = new Hyperliquid({
    privateKey,
    testnet: false
  });

  console.log('\n=== MANUAL POSITION CLOSE ===\n');

  // First, get current positions
  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);

  let positionToClose = null;
  state.assetPositions.forEach(pos => {
    const size = parseFloat(pos.position.szi);
    if (size !== 0 && pos.position.coin === 'SOL-PERP') {
      positionToClose = {
        coin: pos.position.coin,
        size: Math.abs(size),
        isLong: size > 0
      };
      console.log('Found position to close:');
      console.log('  Symbol:', pos.position.coin);
      console.log('  Size:', size, 'units');
      console.log('  Entry Price: $' + pos.position.entryPx);
      console.log('  Unrealized PnL: $' + pos.position.unrealizedPnl);
    }
  });

  if (!positionToClose) {
    console.log('No SOL-PERP position found to close');
    return;
  }

  console.log('\n📉 Closing position...\n');

  // Place market order to close position
  // If long position, we sell. If short position, we buy.
  const orderRequest = {
    coin: positionToClose.coin,
    is_buy: !positionToClose.isLong, // Opposite direction to close
    sz: positionToClose.size,
    order_type: { market: {} },
    reduce_only: true
  };

  try {
    const result = await client.exchange.placeOrder(orderRequest);
    console.log('✅ Close order placed successfully!');
    console.log('Order result:', JSON.stringify(result, null, 2));

    // Wait a moment and check if position is closed
    await new Promise(resolve => setTimeout(resolve, 3000));

    const newState = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const stillOpen = newState.assetPositions.find(p =>
      p.position.coin === 'SOL-PERP' && parseFloat(p.position.szi) !== 0
    );

    if (!stillOpen) {
      console.log('\n✅ POSITION SUCCESSFULLY CLOSED!');
    } else {
      console.log('\n⚠️ Position may still be open. Check Hyperliquid directly.');
    }

  } catch (error) {
    console.error('❌ Error closing position:', error.message);
  }
}

manualClosePosition().catch(console.error);