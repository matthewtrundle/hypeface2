const { HyperliquidClient } = require('./src/services/hyperliquid');

async function checkMainnet() {
  try {
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    const isTestnet = false; // Force mainnet

    console.log('=== MAINNET STATUS CHECK ===');
    console.log('API URL: https://api.hyperliquid.xyz');

    const client = new HyperliquidClient({
      privateKey,
      isTestnet: false
    });

    await client.initialize();

    console.log('\nWallet address:', client.getAddress());

    // Get account value
    const balance = await client.getAccountValue();
    console.log('Account value: $' + balance.toFixed(2));

    // Get open positions
    const positions = await client.getPositions();
    console.log('\nOpen positions:', positions.length);

    if (positions.length > 0) {
      positions.forEach(pos => {
        console.log(`\n${pos.coin}:`);
        console.log(`  Size: ${pos.szi}`);
        console.log(`  Entry: ${pos.entryPx}`);
        console.log(`  Mark: ${pos.markPx}`);
        console.log(`  PnL: ${pos.unrealizedPnl}`);
        console.log(`  Margin: ${pos.marginUsed}`);
      });
    } else {
      console.log('  No open positions');
    }

    // Check recent orders
    const orders = await client.getOpenOrders();
    console.log('\nOpen orders:', orders.length);

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkMainnet();