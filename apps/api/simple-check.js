const { Hyperliquid } = require('hyperliquid');
require('dotenv').config();

async function testOrderIssue() {
  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;

  if (!privateKey || privateKey === 'encrypted-private-key-placeholder') {
    console.error('No valid private key found');
    return;
  }

  const client = new Hyperliquid({
    privateKey: privateKey,
    testnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
  });

  // This is the exact order that's failing
  const order = {
    coin: 'SOL-PERP',
    is_buy: false,
    sz: '0.42',
    order_type: { market: {} },
    reduce_only: true
  };

  console.log('Testing order:', JSON.stringify(order, null, 2));

  try {
    // Let's inspect the exchange object first
    console.log('\nInspecting client.exchange methods:');
    console.log('Type of client.exchange:', typeof client.exchange);
    console.log('Available methods:', Object.keys(client.exchange));

    // Try to place the order
    console.log('\nAttempting to place order...');
    const result = await client.exchange.placeOrder(order);
    console.log('Success! Result:', result);
  } catch (error) {
    console.error('\n❌ Error occurred:', error.message);
    console.error('\nFull error:', error);

    // Let's try to understand what's happening
    console.log('\n--- Debugging Info ---');
    console.log('Error name:', error.name);
    console.log('Error stack:', error.stack);

    // Check if the error is from inside the SDK
    if (error.stack && error.stack.includes('node_modules/hyperliquid')) {
      console.log('\n⚠️  Error is coming from inside the Hyperliquid SDK');

      // Try alternative order formats
      console.log('\n--- Testing Alternative Formats ---');

      const alternatives = [
        { desc: 'Without order_type wrapper', order: { ...order, order_type: 'market' } },
        { desc: 'With limit_px: null', order: { ...order, limit_px: null } },
        { desc: 'With limit_px: 0', order: { ...order, limit_px: 0 } },
        { desc: 'Number size instead of string', order: { ...order, sz: 0.42 } },
        { desc: 'With px field', order: { ...order, px: null } },
        { desc: 'With price field', order: { ...order, price: null } }
      ];

      for (const alt of alternatives) {
        console.log(`\nTrying: ${alt.desc}`);
        try {
          const result = await client.exchange.placeOrder(alt.order);
          console.log('✅ This format works! Result:', result);
          console.log('Working order format:', JSON.stringify(alt.order, null, 2));
          break;
        } catch (e) {
          console.log(`❌ Still fails: ${e.message}`);
        }
      }
    }
  }
}

testOrderIssue();