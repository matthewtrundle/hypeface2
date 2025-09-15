const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

const PRIVATE_KEY = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';

async function testOrder() {
  try {
    console.log('Testing small order on Hyperliquid...');

    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log('Wallet address:', wallet.address);

    const client = new Hyperliquid({
      privateKey: PRIVATE_KEY,
      testnet: false
    });

    // Get current SOL price
    const allMids = await client.info.generalAPI.getAllMids();
    const solPrice = parseFloat(allMids['SOL-PERP']);
    console.log('Current SOL-PERP price:', solPrice);

    // Calculate small test order size
    const orderValue = 10; // $10 test order
    const orderSize = Math.round((orderValue / solPrice) * 100) / 100; // Round to 2 decimals
    console.log('Order size:', orderSize, 'SOL');

    // Place a small market buy order
    console.log('\nPlacing test order...');
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: orderSize,
      limit_px: null,
      order_type: { market: {} },
      reduce_only: false
    });

    console.log('Order result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testOrder();