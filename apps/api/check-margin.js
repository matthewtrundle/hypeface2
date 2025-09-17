require('dotenv').config();
const { HyperliquidClient } = require('./dist/services/hyperliquid-client');

async function checkAccountDetails() {
  try {
    console.log('=== CHECKING HYPERLIQUID ACCOUNT DETAILS ===');

    const client = new HyperliquidClient({
      privateKey: process.env.WALLET_PRIVATE_KEY,
      isTestnet: false
    });

    await client.initialize();
    console.log('Client initialized');
    console.log('Wallet address:', client.getWalletAddress());

    // Get account value using our function
    const accountValue = await client.getAccountValue();
    console.log('\n📊 Account Value from getAccountValue():', `$${accountValue.toFixed(2)}`);

    // Now let's get the raw clearinghouse state
    const { Hyperliquid } = require('@nktkas/hyperliquid');
    const directClient = new Hyperliquid({
      privateKey: process.env.WALLET_PRIVATE_KEY,
      testnet: false
    });

    const clearinghouseState = await directClient.info.perpetuals.getClearinghouseState(
      client.getWalletAddress()
    );

    console.log('\n💰 FULL MARGIN SUMMARY:');
    console.log('  Account Value:', clearinghouseState.marginSummary.accountValue);
    console.log('  Total Margin Used:', clearinghouseState.marginSummary.totalMarginUsed);
    console.log('  Total Ntl Pos:', clearinghouseState.marginSummary.totalNtlPos);
    console.log('  Total Raw USD:', clearinghouseState.marginSummary.totalRawUsd);
    console.log('  Withdrawable:', clearinghouseState.withdrawable);

    // Check cross margin state
    console.log('\n🔄 CROSS MARGIN SUMMARY:');
    if (clearinghouseState.crossMarginSummary) {
      console.log('  Account Value:', clearinghouseState.crossMarginSummary.accountValue);
      console.log('  Total Margin Used:', clearinghouseState.crossMarginSummary.totalMarginUsed);
      console.log('  Total Ntl Pos:', clearinghouseState.crossMarginSummary.totalNtlPos);
      console.log('  Total Raw USD:', clearinghouseState.crossMarginSummary.totalRawUsd);
    } else {
      console.log('  No cross margin data');
    }

    // Calculate what position sizes should be
    console.log('\n📈 EXPECTED POSITION SIZES:');
    const pyramidConfig = {
      entryPercentages: [15, 25, 30, 30],
      leverageLevels: [4, 6, 8, 10]
    };

    const solPrice = 140; // Approximate
    for (let i = 0; i < 4; i++) {
      const percentage = pyramidConfig.entryPercentages[i];
      const leverage = pyramidConfig.leverageLevels[i];
      const marginToUse = accountValue * (percentage / 100);
      const positionValue = marginToUse * leverage;
      const solSize = positionValue / solPrice;

      console.log(`  Level ${i + 1}: ${percentage}% @ ${leverage}x`);
      console.log(`    Margin: $${marginToUse.toFixed(2)}`);
      console.log(`    Position Value: $${positionValue.toFixed(2)}`);
      console.log(`    SOL Size: ${solSize.toFixed(2)} SOL`);
    }

    // Get current positions
    const positions = await client.getPositions();
    console.log('\n📍 CURRENT POSITIONS:');
    if (positions.length > 0) {
      positions.forEach(pos => {
        console.log(`  ${pos.coin}:`);
        console.log(`    Size: ${pos.szi}`);
        console.log(`    Entry: ${pos.entryPx}`);
        console.log(`    Mark: ${pos.markPx}`);
        console.log(`    Margin Used: ${pos.marginUsed}`);
        console.log(`    Position Value: $${(parseFloat(pos.szi) * parseFloat(pos.markPx)).toFixed(2)}`);
      });
    } else {
      console.log('  No open positions');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkAccountDetails();
