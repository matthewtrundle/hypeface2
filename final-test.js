const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function testOrder() {
  try {
    const privateKey = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';
    const wallet = new ethers.Wallet(privateKey);
    console.log('Testing order placement...');
    console.log('Wallet:', wallet.address);

    const client = new Hyperliquid({ privateKey, testnet: false });

    // Get current price
    const allMids = await client.info.generalAPI.getAllMids();
    const currentPrice = parseFloat(allMids['SOL-PERP']);
    console.log('Current SOL-PERP price:', currentPrice);

    // Round price to tick size (0.05)
    const tickSize = 0.05;
    const limitPrice = Math.round((currentPrice * 1.001) / tickSize) * tickSize;
    console.log('Limit price (rounded):', limitPrice);

    // Small test order
    const orderSize = 0.17;
    console.log('Order size:', orderSize);

    console.log('\nPlacing limit order...');
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: orderSize,
      limit_px: limitPrice,
      order_type: { limit: { tif: 'Ioc' } }, // Try Immediate or Cancel
      reduce_only: false
    });

    console.log('Success! Result:', JSON.stringify(result, null, 2));
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testOrder();