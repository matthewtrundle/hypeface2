const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function check() {
  const wallet = new ethers.Wallet('a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156');
  const client = new Hyperliquid({ privateKey: wallet.privateKey, testnet: false });

  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);
  console.log('Account:', state.marginSummary.accountValue);
  console.log('Positions:', state.assetPositions.length);

  if (state.assetPositions.length > 0) {
    state.assetPositions.forEach(p => {
      console.log(`- ${p.position.coin}: ${p.position.szi} @ ${p.position.entryPx}`);
    });
  }

  process.exit(0);
}

check().catch(e => {
  console.error(e.message);
  process.exit(1);
});