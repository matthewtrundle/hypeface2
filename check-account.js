const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

const PRIVATE_KEY = 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';

async function checkAccount() {
  try {
    console.log('Checking Hyperliquid account...');

    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log('Wallet address:', wallet.address);

    const client = new Hyperliquid({
      privateKey: PRIVATE_KEY,
      testnet: false
    });

    // Get account state
    const clearinghouseState = await client.info.perpetuals.getClearinghouseState(wallet.address);
    console.log('\nAccount Value:', clearinghouseState.marginSummary.accountValue);
    console.log('Available Balance:', clearinghouseState.marginSummary.availableMargin);

    // Check positions
    const positions = clearinghouseState.assetPositions;
    console.log('\nPositions:', positions.length);

    if (positions.length > 0) {
      positions.forEach(pos => {
        console.log(`- ${pos.position.coin}: Size=${pos.position.szi}, Entry=${pos.position.entryPx}, PnL=${pos.position.unrealizedPnl}`);
      });
    } else {
      console.log('No open positions');
    }

    // Get recent orders
    const orders = await client.info.generalAPI.getUserOpenOrders(wallet.address);
    console.log('\nOpen Orders:', orders.length);

    // Get recent fills
    const fills = await client.info.generalAPI.getUserFills(wallet.address);
    console.log('\nRecent Fills:', fills.length);
    if (fills.length > 0) {
      console.log('Last 5 fills:');
      fills.slice(0, 5).forEach(fill => {
        console.log(`- ${fill.coin} ${fill.side} ${fill.px} x ${fill.sz} at ${new Date(fill.time).toLocaleString()}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAccount();