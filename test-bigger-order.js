const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

const PRIVATE_KEY = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';

async function testOrder() {
  try {
    console.log('Testing order on Hyperliquid...');

    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log('Wallet address:', wallet.address);

    const client = new Hyperliquid({
      privateKey: PRIVATE_KEY,
      testnet: false
    });

    // Get account value
    const clearinghouseState = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const accountValue = parseFloat(clearinghouseState.marginSummary.accountValue);
    console.log('Account value:', accountValue);

    // Get current SOL price
    const allMids = await client.info.generalAPI.getAllMids();
    const solPrice = parseFloat(allMids['SOL-PERP']);
    console.log('Current SOL-PERP price:', solPrice);

    // Calculate 40% position (like pyramid first entry)
    const positionValue = accountValue * 0.4;
    const orderSize = Math.floor((positionValue / solPrice) * 100) / 100;
    console.log('Position value:', positionValue);
    console.log('Order size:', orderSize, 'SOL');

    // Place market buy order
    console.log('\nPlacing market buy order...');
    const result = await client.exchange.placeOrder({
      coin: 'SOL-PERP',
      is_buy: true,
      sz: orderSize,
      limit_px: null,
      order_type: { market: {} },
      reduce_only: false
    });

    console.log('Order result:', JSON.stringify(result, null, 2));

    // Wait a bit then check position
    setTimeout(async () => {
      const newState = await client.info.perpetuals.getClearinghouseState(wallet.address);
      const positions = newState.assetPositions;
      console.log('\nPositions after order:');
      positions.forEach(pos => {
        console.log(`- ${pos.position.coin}: Size=${pos.position.szi}`);
      });
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testOrder();