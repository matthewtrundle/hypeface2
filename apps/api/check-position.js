const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');
require('dotenv').config();

async function checkPosition() {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey);

  const client = new Hyperliquid({
    privateKey,
    testnet: false
  });

  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);

  console.log('\n=== ACCOUNT STATUS ===');
  console.log('Account Value: $' + state.marginSummary.accountValue);
  console.log('\n=== OPEN POSITIONS ===');

  let hasPositions = false;
  state.assetPositions.forEach(pos => {
    const size = parseFloat(pos.position.szi);
    if (size !== 0) {
      hasPositions = true;
      console.log('Symbol:', pos.position.coin);
      console.log('  Size:', size, 'units');
      console.log('  Entry Price: $' + pos.position.entryPx);
      console.log('  Unrealized PnL: $' + pos.position.unrealizedPnl);
      console.log('  Leverage:', pos.position.leverage?.value || '5x');
      console.log('');
    }
  });

  if (!hasPositions) {
    console.log('No open positions');
  }
}

checkPosition().catch(console.error);