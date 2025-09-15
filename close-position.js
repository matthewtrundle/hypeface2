const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function closePosition() {
  try {
    const privateKey = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';
    const wallet = new ethers.Wallet(privateKey);
    console.log('Closing position...');

    const client = new Hyperliquid({ privateKey, testnet: false });

    // Close the position with a market sell
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: false,  // Sell to close long
      sz: 0.17,
      limit_px: 230,  // Low limit to ensure fill
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: true
    });

    console.log('Close order result:', JSON.stringify(result, null, 2));
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

closePosition();