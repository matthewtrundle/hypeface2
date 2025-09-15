const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function openLeveragedPosition() {
  try {
    const privateKey = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';
    const wallet = new ethers.Wallet(privateKey);
    const client = new Hyperliquid({ privateKey, testnet: false });

    // Get account info
    const state = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const accountValue = parseFloat(state.marginSummary.accountValue);
    console.log('Account value:', accountValue);

    // Get current price
    const allMids = await client.info.generalAPI.getAllMids();
    const currentPrice = parseFloat(allMids['SOL-PERP']);
    console.log('Current SOL price:', currentPrice);

    // Calculate position with leverage
    const leverage = 3; // 3x leverage for first pyramid level
    const percentOfAccount = 0.4; // 40% for first entry
    const positionValue = accountValue * percentOfAccount * leverage;
    const orderSize = Math.floor((positionValue / currentPrice) * 100) / 100;

    console.log('\nPosition calculation:');
    console.log('- Account:', accountValue);
    console.log('- Using 40% =', accountValue * 0.4);
    console.log('- With 3x leverage =', positionValue);
    console.log('- Order size:', orderSize, 'SOL');
    console.log('- Position value:', orderSize * currentPrice);

    // Round price to tick
    const tickSize = 0.05;
    const limitPrice = Math.round((currentPrice * 1.001) / tickSize) * tickSize;

    console.log('\nPlacing order at:', limitPrice);
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: orderSize,
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

openLeveragedPosition();