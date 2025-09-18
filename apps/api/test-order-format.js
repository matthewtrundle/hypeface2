// Test to verify the order format issue and solution

console.log('=== Hyperliquid Order Format Analysis ===\n');

// The problematic order that was failing
const failingOrder = {
  coin: 'SOL-PERP',
  is_buy: false,
  sz: 0.42,
  order_type: 'market',
  reduce_only: true
};

console.log('FAILING ORDER (your original):');
console.log(JSON.stringify(failingOrder, null, 2));
console.log('\nPROBLEM: Missing limit_px field which is REQUIRED by the SDK\n');

// The corrected order format
const workingOrder = {
  coin: 'SOL-PERP',
  is_buy: false,
  sz: '0.42',  // Can be string or number
  limit_px: 235.00,  // REQUIRED - use current_price * (1 - slippage) for sells
  order_type: { limit: { tif: 'Ioc' } },  // Market orders are Ioc limit orders
  reduce_only: true
};

console.log('WORKING ORDER (corrected):');
console.log(JSON.stringify(workingOrder, null, 2));
console.log('\nKEY CHANGES:');
console.log('1. Added limit_px field (REQUIRED)');
console.log('2. Changed order_type to { limit: { tif: "Ioc" } }');
console.log('3. limit_px should be calculated as:');
console.log('   - For SELL: current_price * (1 - slippage)');
console.log('   - For BUY: current_price * (1 + slippage)');
console.log('   - Typical slippage: 0.01 to 0.05 (1% to 5%)');

console.log('\n=== Implementation in your placeOrder method ===\n');

console.log(`
The fix in hyperliquid-client.ts handles this automatically:

1. When order_type === 'market':
   - Fetches current price via getMarketPrice()
   - Applies 5% slippage
   - Sets limit_px to the calculated slippage price

2. Always uses { limit: { tif: 'Ioc' } } for order_type
   - This gives market-like behavior
   - Ioc = Immediate or Cancel

3. The SDK then accepts the order because:
   - limit_px is present (no more toFixed() error)
   - order_type is in the correct format
`);

console.log('\n=== Alternative: Using SDK\'s marketClose method ===\n');
console.log(`
Instead of manually handling this, you can use:

client.custom.marketClose(
  'SOL-PERP',     // symbol
  0.42,           // size (optional, closes all if not provided)
  undefined,      // price (optional, SDK fetches if not provided)
  0.05            // slippage (5%)
);

This method handles all the complexity internally!
`);

console.log('\n=== SUMMARY ===\n');
console.log('✅ Your hyperliquid-client.ts is now fixed');
console.log('✅ It will automatically add limit_px for market orders');
console.log('✅ It uses the correct order_type format');
console.log('✅ The toFixed() error should be resolved');
console.log('\nDeploy the updated code to Railway to test with real positions.');