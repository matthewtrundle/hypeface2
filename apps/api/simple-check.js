// Simple check of account balance and position sizing calculation
require('dotenv').config();

async function calculateExpectedPositionSize() {
  console.log('=== PYRAMID POSITION SIZING ANALYSIS ===\n');

  // Pyramid configuration (from the code)
  const config = {
    entryPercentages: [15, 25, 30, 30],  // % of account per level
    leverageLevels: [4, 6, 8, 10],       // leverage per level
    maxPyramidLevels: 4
  };

  console.log('Pyramid Configuration:');
  console.log('Entry Percentages:', config.entryPercentages);
  console.log('Leverage Levels:', config.leverageLevels);
  console.log();

  // Simulate different account values
  const testAccountValues = [100, 500, 1000, 2000]; // USD
  const solPrice = 140; // Approximate SOL price

  console.log('EXPECTED POSITION SIZES BY ACCOUNT VALUE:\n');

  for (const accountValue of testAccountValues) {
    console.log(`Account Value: $${accountValue}`);
    console.log('Level | Entry% | Leverage | USD Size | SOL Size | Total SOL');
    console.log('------|--------|----------|----------|----------|----------');

    let totalSolPosition = 0;

    for (let level = 0; level < config.maxPyramidLevels; level++) {
      const entryPercentage = config.entryPercentages[level];
      const leverage = config.leverageLevels[level];

      // CRITICAL: The bug is here - position size calculation
      // Current buggy code: positionSize = accountValue * (entryPercentage / 100) * leverage
      // This applies leverage to the USD value, which is wrong

      const usdSize = accountValue * (entryPercentage / 100) * leverage;
      const solSize = usdSize / solPrice;
      totalSolPosition += solSize;

      console.log(`  ${level + 1}   |   ${entryPercentage}%  |    ${leverage}x    | $${usdSize.toFixed(0).padStart(6)} | ${solSize.toFixed(2).padStart(6)} | ${totalSolPosition.toFixed(2).padStart(6)}`);
    }

    console.log();
    console.log(`Total Position Value: $${(totalSolPosition * solPrice).toFixed(0)}`);
    console.log(`Effective Leverage: ${((totalSolPosition * solPrice) / accountValue).toFixed(1)}x`);
    console.log();
    console.log('---'.repeat(20));
    console.log();
  }

  console.log('CURRENT BUG ANALYSIS:');
  console.log('The current code calculates position size as:');
  console.log('  positionSize = accountValue * (entryPercentage / 100) * leverage');
  console.log('  sizeInAsset = positionSize / currentPrice');
  console.log();
  console.log('This means:');
  console.log('- For 15% of $1000 account at 4x leverage = $600 position');
  console.log('- At $140 SOL price = 4.29 SOL position');
  console.log('- This is CORRECT behavior for leveraged trading');
  console.log();
  console.log('The 4.88 SOL position suggests:');
  console.log('- Account value was around $1140 when position opened');
  console.log('- Or there was additional capital from existing positions');

  console.log('\n=== RECOMMENDATION ===');
  console.log('The position sizing logic appears CORRECT for leveraged trading.');
  console.log('The confusion may be in understanding that:');
  console.log('1. Pyramid percentages (15%) are of TOTAL account value');
  console.log('2. Leverage (4x) amplifies the position size');
  console.log('3. A 15% allocation at 4x leverage = 60% effective exposure');
  console.log();
  console.log('Need to verify actual account balance at time of trade.');
}

calculateExpectedPositionSize().catch(console.error);