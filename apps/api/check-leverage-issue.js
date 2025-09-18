const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');

async function checkLeverageIssue() {
  console.log('=== HYPERLIQUID LEVERAGE DIAGNOSTIC ===\n');

  // Test configuration
  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;

  if (!privateKey || privateKey === 'encrypted-private-key-placeholder') {
    console.error('No valid private key found in environment variables');
    return;
  }

  try {
    // Initialize client
    const client = new Hyperliquid({
      privateKey: privateKey,
      testnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
    });

    const wallet = new ethers.Wallet(privateKey);
    console.log(`Wallet Address: ${wallet.address}\n`);

    // Get clearinghouse state
    const clearinghouseState = await client.info.perpetuals.getClearinghouseState(wallet.address);

    // 1. Account Summary
    console.log('📊 ACCOUNT SUMMARY:');
    console.log(`  Account Value: $${parseFloat(clearinghouseState.marginSummary.accountValue).toFixed(2)}`);
    console.log(`  Total Margin Used: $${parseFloat(clearinghouseState.marginSummary.totalMarginUsed).toFixed(2)}`);
    console.log(`  Total Notional Position: $${parseFloat(clearinghouseState.marginSummary.totalNtlPos).toFixed(2)}`);
    console.log(`  Available Margin: $${(parseFloat(clearinghouseState.marginSummary.accountValue) - parseFloat(clearinghouseState.marginSummary.totalMarginUsed)).toFixed(2)}`);
    console.log('');

    // 2. Cross Margin Settings
    console.log('⚙️ CROSS MARGIN SETTINGS:');
    if (clearinghouseState.crossMarginSummary) {
      console.log(`  Account Value: $${parseFloat(clearinghouseState.crossMarginSummary.accountValue).toFixed(2)}`);
      console.log(`  Total Margin Used: $${parseFloat(clearinghouseState.crossMarginSummary.totalMarginUsed).toFixed(2)}`);
      console.log(`  Total Notional: $${parseFloat(clearinghouseState.crossMarginSummary.totalNtlPos).toFixed(2)}`);
    }
    console.log('');

    // 3. Position Details
    console.log('📈 ACTIVE POSITIONS:');
    for (const assetPos of clearinghouseState.assetPositions) {
      const pos = assetPos.position;
      const size = parseFloat(pos.szi);

      if (Math.abs(size) > 0.01) {
        const entryPrice = parseFloat(pos.entryPx);
        const notionalValue = Math.abs(size * entryPrice);
        const marginUsed = parseFloat(pos.marginUsed || '0');

        console.log(`\n  ${pos.coin}:`);
        console.log(`    Size: ${size.toFixed(4)} ${pos.coin.replace('-PERP', '')}`);
        console.log(`    Entry Price: $${entryPrice.toFixed(2)}`);
        console.log(`    Notional Value: $${notionalValue.toFixed(2)}`);
        console.log(`    Margin Used: $${marginUsed.toFixed(2)}`);
        console.log(`    Leverage: ${pos.leverage || 'N/A'}`);

        // Calculate actual leverage
        if (marginUsed > 0) {
          const actualLeverage = notionalValue / marginUsed;
          console.log(`    Calculated Leverage: ${actualLeverage.toFixed(2)}x`);
        }

        // Check leverage settings
        console.log(`    Max Leverage: ${assetPos.maxLeverage || 'N/A'}`);
      }
    }
    console.log('');

    // 4. Get leverage settings directly
    console.log('🔧 LEVERAGE CONFIGURATION:');

    // Get meta info to understand leverage limits
    const meta = await client.info.perpetuals.getMeta();
    const solMeta = meta.universe.find(u => u.name === 'SOL-PERP');

    if (solMeta) {
      console.log(`  SOL-PERP Max Leverage: ${solMeta.maxLeverage}x`);
      console.log(`  SOL-PERP Initial Margin: ${(1/solMeta.maxLeverage * 100).toFixed(2)}%`);
    }
    console.log('');

    // 5. Test setting leverage
    console.log('🧪 TESTING LEVERAGE UPDATE:');
    console.log('  Attempting to set SOL-PERP leverage to 5x (cross margin)...');

    try {
      // Update leverage to 5x for SOL-PERP
      const leverageResult = await client.exchange.updateLeverage(
        true,      // is_cross (true for cross margin)
        5,         // leverage
        3          // asset index for SOL-PERP
      );

      console.log('  ✅ Leverage update result:', leverageResult);
    } catch (error) {
      console.log('  ❌ Failed to update leverage:', error.message);
    }
    console.log('');

    // 6. Calculate what SHOULD happen with proper leverage
    const accountValue = parseFloat(clearinghouseState.marginSummary.accountValue);
    const targetLeverage = 5;
    const pyramidMargins = [10, 15, 20, 25]; // % of account value

    console.log('📐 EXPECTED POSITION SIZES (with 5x leverage):');
    console.log(`  Account Value: $${accountValue.toFixed(2)}`);
    console.log(`  Target Leverage: ${targetLeverage}x`);
    console.log('');

    let totalMargin = 0;
    let totalNotional = 0;

    pyramidMargins.forEach((marginPct, level) => {
      const margin = accountValue * (marginPct / 100);
      const notional = margin * targetLeverage;
      totalMargin += margin;
      totalNotional += notional;

      console.log(`  Level ${level + 1} (${marginPct}% margin):`);
      console.log(`    Margin: $${margin.toFixed(2)}`);
      console.log(`    Notional: $${notional.toFixed(2)}`);

      // Assuming SOL at ~$245
      const solPrice = 245;
      const solSize = notional / solPrice;
      console.log(`    SOL Size: ${solSize.toFixed(4)} SOL`);
      console.log('');
    });

    console.log(`  Total after all pyramids:`);
    console.log(`    Total Margin: $${totalMargin.toFixed(2)} (${(totalMargin/accountValue*100).toFixed(1)}% of account)`);
    console.log(`    Total Notional: $${totalNotional.toFixed(2)}`);
    console.log(`    Effective Leverage: ${(totalNotional/totalMargin).toFixed(2)}x`);

  } catch (error) {
    console.error('Error during diagnostic:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the diagnostic
checkLeverageIssue();