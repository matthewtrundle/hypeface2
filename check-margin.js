const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function checkMargin() {
  const wallet = new ethers.Wallet('a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156');
  const client = new Hyperliquid({ privateKey: wallet.privateKey, testnet: false });

  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);

  // Get user state for more details
  const userState = await client.info.perpetuals.getUserState(wallet.address);

  console.log('=== MARGIN BREAKDOWN ===');
  console.log('Raw marginSummary:', JSON.stringify(state.marginSummary, null, 2));

  if (state.assetPositions.length > 0) {
    const pos = state.assetPositions[0];
    const position = pos.position;
    const size = Math.abs(parseFloat(position.szi));
    const entry = parseFloat(position.entryPx);
    const positionValue = size * entry;

    console.log('\n=== POSITION DETAILS ===');
    console.log('Position Size:', size, 'SOL');
    console.log('Entry Price:', entry);
    console.log('Position Value:', positionValue.toFixed(2));
    console.log('Position rawUsd:', position.positionValue);
    console.log('Position marginUsed:', position.marginUsed);
    console.log('Position cumFunding:', position.cumFunding);

    // Calculate implied margin
    console.log('\n=== CALCULATIONS ===');
    const accountValue = parseFloat(state.marginSummary.accountValue);
    const impliedMarginUsed = accountValue - 72.51;
    const impliedLeverage = positionValue / impliedMarginUsed;

    console.log('Account Value:', accountValue);
    console.log('Available (from UI):', 72.51);
    console.log('Implied Margin Used:', impliedMarginUsed.toFixed(2));
    console.log('Implied Position Leverage:', impliedLeverage.toFixed(1) + 'x');
    console.log('Account Leverage:', (positionValue / accountValue).toFixed(1) + 'x');
  }

  console.log('\n=== USER STATE ===');
  console.log('Raw userState:', JSON.stringify(userState, null, 2));

  process.exit(0);
}

checkMargin().catch(console.error);