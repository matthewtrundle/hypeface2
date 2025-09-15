const axios = require('axios');
const { ethers } = require('ethers');

async function directTest() {
  const privateKey = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';
  const wallet = new ethers.Wallet(privateKey);

  console.log('Testing direct Hyperliquid API call...');
  console.log('Wallet:', wallet.address);

  // Construct order directly (bypass SDK)
  const timestamp = Date.now();
  const order = {
    action: {
      type: 'order',
      orders: [{
        a: 5, // SOL asset ID
        b: true, // is_buy
        p: '233.50', // price (string)
        s: '0.17', // size (string)
        r: false, // reduce_only
        t: { limit: { tif: 'Gtc' } }
      }]
    },
    nonce: timestamp,
    signature: null // Will need to sign this properly
  };

  // This would need proper signing, but shows the structure
  console.log('Order structure:', JSON.stringify(order, null, 2));

  // Actually, let's use the SDK one more time with absolute minimal params
  const { Hyperliquid } = require('hyperliquid');
  const client = new Hyperliquid({ privateKey, testnet: false });

  try {
    console.log('\nTrying minimal market order...');
    const result = await client.exchange.marketOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: 0.17
    });
    console.log('Result:', result);
  } catch (e) {
    console.error('Market order failed:', e.message);
  }

  process.exit(0);
}

directTest().catch(console.error);