const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function simpleCheck() {
  const wallet = new ethers.Wallet('a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156');
  const client = new Hyperliquid({ privateKey: wallet.privateKey, testnet: false });

  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);

  const accountValue = parseFloat(state.marginSummary.accountValue);
  const pos = state.assetPositions[0];
  const size = Math.abs(parseFloat(pos.position.szi));
  const entry = parseFloat(pos.position.entryPx);
  const positionValue = size * entry;

  console.log('Position: ' + size + ' SOL @ $' + entry);
  console.log('Position Value: $' + positionValue.toFixed(2));
  console.log('Account Value: $' + accountValue.toFixed(2));
  console.log('');
  console.log('If Available = $72.51, then:');
  console.log('Margin Used = $' + (accountValue - 72.51).toFixed(2));
  console.log('Position Leverage = ' + (positionValue / (accountValue - 72.51)).toFixed(1) + 'x');
  console.log('');
  console.log('This means Hyperliquid is using ' + (positionValue / (accountValue - 72.51)).toFixed(1) + 'x leverage on the position');
  console.log('Your $' + (accountValue - 72.51).toFixed(2) + ' controls $' + positionValue.toFixed(2));

  process.exit(0);
}

simpleCheck().catch(console.error);