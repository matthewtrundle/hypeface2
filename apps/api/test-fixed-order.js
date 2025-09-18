const { Hyperliquid } = require('hyperliquid');
const { ethers } = require('ethers');
require('dotenv').config();

async function testFixedOrdering() {
  console.log('=== Testing Fixed Order Implementation ===\n');

  const privateKey = process.env.WALLET_PRIVATE_KEY || process.env.FALLBACK_WALLET_KEY;

  if (!privateKey || privateKey === 'encrypted-private-key-placeholder') {
    console.error('No valid private key found');
    return;
  }

  const client = new Hyperliquid({
    privateKey: privateKey,
    testnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
  });

  const wallet = new ethers.Wallet(privateKey);
  console.log(`Wallet address: ${wallet.address}\n`);

  try {
    // Get current position
    const clearinghouseState = await client.info.perpetuals.getClearinghouseState(wallet.address);
    const solPosition = clearinghouseState.assetPositions.find(p => p.position.coin === 'SOL-PERP');

    if (!solPosition || Math.abs(parseFloat(solPosition.position.szi)) < 0.01) {
      console.log('No SOL position found');
      return;
    }

    const currentSize = Math.abs(parseFloat(solPosition.position.szi));
    console.log(`Current SOL position: ${currentSize} SOL @ ${solPosition.position.entryPx}\n`);

    // Get current market price
    const allMids = await client.info.getAllMids();
    const currentPrice = parseFloat(allMids['SOL-PERP']);
    console.log(`Current market price: $${currentPrice}\n`);

    // Test 1: Using the SDK's marketClose method (RECOMMENDED)
    console.log('Method 1: Using SDK marketClose method');
    console.log('----------------------------------------');
    try {
      const closeSize = Math.min(0.01, currentSize); // Close minimal amount for testing
      const slippage = 0.05; // 5% slippage

      console.log(`Closing ${closeSize} SOL with ${slippage * 100}% slippage`);

      // THIS IS THE CORRECT WAY - let the SDK handle it
      const result = await client.custom.marketClose(
        'SOL-PERP',
        closeSize,
        undefined,  // let SDK get the price
        slippage
      );

      console.log('✅ Success with marketClose!');
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('❌ marketClose failed:', error.message);
    }

    console.log('\n');

    // Test 2: Manual market order with proper limit_px
    console.log('Method 2: Manual order with calculated limit_px');
    console.log('-----------------------------------------------');
    try {
      const closeSize = Math.min(0.01, currentSize);
      const slippage = 0.05;

      // Calculate slippage price (REQUIRED for SDK)
      const limitPrice = currentPrice * (1 - slippage); // Lower price for sell
      const roundedPrice = Math.round(limitPrice * 100) / 100; // Round to 2 decimals

      console.log(`Selling ${closeSize} SOL at limit price $${roundedPrice} (5% below market)`);

      const orderRequest = {
        coin: 'SOL-PERP',
        is_buy: false,
        sz: closeSize.toString(),
        limit_px: roundedPrice,  // MUST provide limit_px
        order_type: { limit: { tif: 'Ioc' } }, // Ioc for market-like behavior
        reduce_only: true
      };

      console.log('Order request:', JSON.stringify(orderRequest, null, 2));

      const result = await client.exchange.placeOrder(orderRequest);
      console.log('✅ Success with manual order!');
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('❌ Manual order failed:', error.message);
    }

    console.log('\n');

    // Test 3: What NOT to do (will fail)
    console.log('Method 3: What NOT to do (missing limit_px)');
    console.log('--------------------------------------------');
    try {
      const badOrder = {
        coin: 'SOL-PERP',
        is_buy: false,
        sz: '0.01',
        // limit_px missing or null - THIS WILL FAIL
        order_type: { market: {} },
        reduce_only: true
      };

      console.log('Bad order (no limit_px):', JSON.stringify(badOrder, null, 2));
      const result = await client.exchange.placeOrder(badOrder);
      console.log('Unexpected success?', result);
    } catch (error) {
      console.log('❌ Expected failure:', error.message);
      console.log('This is expected - limit_px is REQUIRED by the SDK');
    }

  } catch (error) {
    console.error('Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Display summary
console.log(`
================================================================================
HYPERLIQUID SDK - CRITICAL INFORMATION
================================================================================

1. The SDK does NOT support true market orders
   - All \"market\" orders are actually limit orders with Ioc (Immediate or Cancel)

2. The limit_px field is ALWAYS REQUIRED
   - Even for \"market\" orders, you must provide a limit price
   - Calculate it as: current_price * (1 ± slippage)

3. Recommended approach:
   - Use client.custom.marketClose() for closing positions
   - Use client.custom.marketOpen() for opening positions
   - These methods handle the slippage calculation internally

4. If using client.exchange.placeOrder() directly:
   - ALWAYS provide limit_px (number or string)
   - Use order_type: { limit: { tif: 'Ioc' } } for market-like behavior
   - Calculate appropriate slippage for your use case

5. The error \"Cannot read properties of undefined (reading 'toFixed')\"
   - This happens when limit_px is null/undefined
   - The SDK tries to format it internally and fails

================================================================================
`);

testFixedOrdering();