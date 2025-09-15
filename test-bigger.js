const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function testBigger() {
  try {
    const privateKey = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';
    const wallet = new ethers.Wallet(privateKey);
    const client = new Hyperliquid({ privateKey, testnet: false });

    // Get current state
    const state = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const accountValue = parseFloat(state.marginSummary.accountValue);

    // Get current price
    const allMids = await client.info.generalAPI.getAllMids();
    const currentPrice = parseFloat(allMids['SOL-PERP']);

    console.log('Account:', accountValue);
    console.log('Current SOL price:', currentPrice);
    console.log('Current position: 0.52 SOL = $121');

    // Let's add a much bigger position to test leverage
    // Try to use most of our buying power
    const additionalSize = 2.0; // Add 2 more SOL
    const additionalValue = additionalSize * currentPrice;

    console.log('\nAdding to position:');
    console.log('- Additional size: 2.0 SOL');
    console.log('- Additional value:', additionalValue);
    console.log('- Total position would be: 2.52 SOL');
    console.log('- Total value would be:', (2.52 * currentPrice).toFixed(2));
    console.log('- Leverage would be:', ((2.52 * currentPrice) / accountValue).toFixed(1) + 'x');

    // Round price
    const tickSize = 0.05;
    const limitPrice = Math.round((currentPrice * 1.001) / tickSize) * tickSize;

    console.log('\nPlacing order at:', limitPrice);
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: additionalSize,
      limit_px: limitPrice,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false
    });

    console.log('\nResult:', JSON.stringify(result, null, 2));
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testBigger();