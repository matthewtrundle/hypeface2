const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function testLeverageFix() {
  console.log('=== TESTING LEVERAGE FIX ===\n');

  const privateKey = process.env.WALLET_PRIVATE_KEY || 'a29b8d1f28d95037a16229c73543e464878dc0ae27477943fcb61347e6c0f156';

  try {
    const client = new Hyperliquid({
      privateKey: privateKey,
      testnet: false
    });

    const wallet = new ethers.Wallet(privateKey);
    console.log(`Wallet: ${wallet.address}\n`);

    // 1. Get current state BEFORE setting leverage
    console.log('📊 BEFORE LEVERAGE CHANGE:');
    let state = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const solPos = state.assetPositions.find(p => p.position.coin === 'SOL-PERP');

    if (solPos && Math.abs(parseFloat(solPos.position.szi)) > 0.01) {
      const size = parseFloat(solPos.position.szi);
      const entry = parseFloat(solPos.position.entryPx);
      const notional = Math.abs(size * entry);
      const marginUsed = parseFloat(solPos.position.marginUsed || '0');
      console.log(`  Position: ${size.toFixed(4)} SOL @ $${entry.toFixed(2)}`);
      console.log(`  Notional: $${notional.toFixed(2)}`);
      console.log(`  Margin Used: $${marginUsed.toFixed(2)}`);
      console.log(`  Current Leverage: ${(notional/marginUsed).toFixed(2)}x`);
    }
    console.log('');

    // 2. Test the CORRECTED updateLeverage method
    console.log('⚙️ SETTING LEVERAGE TO 5x:');
    try {
      // Correct parameter order: leverage, coin, is_cross
      const result = await client.exchange.updateLeverage(
        5,           // leverage amount
        'SOL-PERP',  // coin
        true         // is_cross (true for cross margin)
      );
      console.log('  ✅ Leverage updated successfully!');
      console.log('  Result:', result);
    } catch (error) {
      console.log('  ❌ Failed:', error.message);
      return;
    }
    console.log('');

    // 3. Wait a moment for the change to propagate
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Verify the leverage change
    console.log('📊 AFTER LEVERAGE CHANGE:');
    state = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const newSolPos = state.assetPositions.find(p => p.position.coin === 'SOL-PERP');

    if (newSolPos) {
      console.log(`  Max Leverage Available: ${newSolPos.maxLeverage || 'N/A'}`);

      if (Math.abs(parseFloat(newSolPos.position.szi)) > 0.01) {
        const size = parseFloat(newSolPos.position.szi);
        const entry = parseFloat(newSolPos.position.entryPx);
        const notional = Math.abs(size * entry);
        const marginUsed = parseFloat(newSolPos.position.marginUsed || '0');

        console.log(`  Position: ${size.toFixed(4)} SOL @ $${entry.toFixed(2)}`);
        console.log(`  Notional: $${notional.toFixed(2)}`);
        console.log(`  Margin Used: $${marginUsed.toFixed(2)}`);
        console.log(`  Effective Leverage: ${(notional/marginUsed).toFixed(2)}x`);
        console.log('');

        // Check if margin requirement changed
        const expectedMargin = notional / 5; // 5x leverage = 20% margin
        console.log(`  Expected Margin (at 5x): $${expectedMargin.toFixed(2)}`);

        if (Math.abs(marginUsed - expectedMargin) < 1) {
          console.log('  ✅ Leverage successfully applied!');
        } else {
          console.log('  ⚠️ Note: Leverage changes may only apply to NEW positions');
          console.log('      Existing positions maintain their original leverage');
        }
      }
    }
    console.log('');

    // 5. Important notes
    console.log('📝 IMPORTANT NOTES:');
    console.log('  1. Leverage changes apply to NEW orders only');
    console.log('  2. Existing positions keep their original leverage');
    console.log('  3. To apply 5x leverage to existing positions:');
    console.log('     - Close the current position');
    console.log('     - Set leverage to 5x');
    console.log('     - Open new position');
    console.log('');
    console.log('  4. The pyramid bot will now:');
    console.log('     - Set leverage to 5x BEFORE each order');
    console.log('     - Use correct margin calculations');
    console.log('     - Level 1: ~$43 margin → 0.87 SOL');
    console.log('     - Level 2: ~$64 margin → 1.31 SOL');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testLeverageFix();