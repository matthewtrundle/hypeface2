const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function checkDetailed() {
  const wallet = new ethers.Wallet('a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156');
  const client = new Hyperliquid({ privateKey: wallet.privateKey, testnet: false });

  const state = await client.info.perpetuals.getClearinghouseState(wallet.address);

  console.log('=== ACCOUNT DETAILS ===');
  console.log('Account Value:', state.marginSummary.accountValue);
  console.log('Available Margin:', state.marginSummary.availableMargin);
  console.log('Initial Margin Used:', state.marginSummary.initialMarginUsed);
  console.log('Maintenance Margin:', state.marginSummary.maintenanceMarginUsed);

  if (state.assetPositions.length > 0) {
    console.log('\n=== POSITIONS ===');
    state.assetPositions.forEach(p => {
      const pos = p.position;
      const size = parseFloat(pos.szi);
      const entry = parseFloat(pos.entryPx);
      const value = Math.abs(size * entry);
      const leverage = value / parseFloat(state.marginSummary.accountValue);

      console.log(`${pos.coin}:`);
      console.log(`  Size: ${pos.szi} SOL`);
      console.log(`  Entry: $${pos.entryPx}`);
      console.log(`  Position Value: $${value.toFixed(2)}`);
      console.log(`  Leverage on Account: ${leverage.toFixed(2)}x`);
      console.log(`  Unrealized PnL: $${pos.unrealizedPnl}`);
      console.log(`  Margin Used: ${p.marginUsed}`);
    });
  }

  console.log('\n=== LEVERAGE CAPACITY ===');
  const available = parseFloat(state.marginSummary.availableMargin || 0);
  const maxNewPosition = available * 50; // Max 50x leverage on Hyperliquid
  console.log(`Available for new positions: $${available.toFixed(2)}`);
  console.log(`Max new position (at 50x): $${maxNewPosition.toFixed(2)}`);
  console.log(`Recommended (at 10x): $${(available * 10).toFixed(2)}`);

  process.exit(0);
}

checkDetailed().catch(console.error);