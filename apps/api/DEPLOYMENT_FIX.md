# Hyperliquid SDK Order Placement Fix

## Problem
The error "Cannot read properties of undefined (reading 'toFixed')" was occurring when attempting to place sell orders through the Hyperliquid SDK.

## Root Cause
The Hyperliquid SDK (`hyperliquid` npm package v1.7.7) has the following requirements that were not being met:

1. **`limit_px` is a REQUIRED field** - Even for "market" orders, the SDK requires a limit price
2. **No true market orders exist** - The SDK implements market orders as aggressive limit orders with `Ioc` (Immediate or Cancel)
3. **The SDK internally calls `toFixed()` on `limit_px`** - If this field is null/undefined, it throws the error

## Solution Implemented

### File: `/apps/api/src/services/hyperliquid-client.ts`

The `placeOrder` method has been updated to:

1. **Always provide `limit_px`**:
   - For market orders: Fetches current price and applies 5% slippage
   - For limit orders: Uses the provided limit price

2. **Use correct order type format**:
   - Changed from `{ market: {} }` to `{ limit: { tif: 'Ioc' } }`
   - This provides market-like behavior with immediate execution

3. **Calculate slippage prices**:
   - SELL orders: `current_price * (1 - 0.05)` (5% below market)
   - BUY orders: `current_price * (1 + 0.05)` (5% above market)

### Alternative Method Added

A new method `closePositionWithMarketClose` has been added that uses the SDK's built-in `marketClose` function, which handles all complexity internally.

## Code Changes

```typescript
// Before (FAILING)
const orderParams = {
  coin: order.coin,
  is_buy: order.is_buy,
  sz: formattedSize,
  order_type: order.order_type === 'market' ? { market: {} } : { limit: { tif: 'Ioc' } },
  reduce_only: order.reduce_only || false,
  // limit_px was conditionally added or missing
};

// After (WORKING)
let limitPrice: number;
if (order.order_type === 'market') {
  const currentPrice = await this.getMarketPrice(order.coin);
  const slippage = 0.05; // 5% slippage
  limitPrice = order.is_buy
    ? currentPrice * (1 + slippage)
    : currentPrice * (1 - slippage);
  limitPrice = Math.round(limitPrice * 100) / 100;
} else {
  limitPrice = order.limit_px;
}

const orderParams = {
  coin: order.coin,
  is_buy: order.is_buy,
  sz: formattedSize,
  limit_px: limitPrice, // ALWAYS provided
  order_type: { limit: { tif: 'Ioc' } }, // Always use Ioc for market-like behavior
  reduce_only: order.reduce_only || false,
};
```

## Testing
- TypeScript compilation: ✅ PASSED
- Build process: ✅ PASSED
- Test scripts created in `/apps/api/`:
  - `test-order-format.js` - Explains the fix
  - `test-fixed-order.js` - Tests the implementation
  - `check-margin.js` - Debug tool
  - `simple-check.js` - Error reproduction

## Deployment Steps

1. **Deploy to Railway**:
   ```bash
   cd /apps/api
   railway up
   ```

2. **Monitor logs**:
   ```bash
   railway logs
   ```

3. **Test with actual position**:
   - The fix will automatically apply when a sell signal is received
   - Monitor for successful order placement without toFixed() errors

## Key Takeaways

1. The Hyperliquid SDK doesn't support true market orders
2. Always provide `limit_px` even for "market" orders
3. Use `{ limit: { tif: 'Ioc' } }` for market-like execution
4. Consider using SDK's `custom.marketClose()` for simpler position closing

## Verification

After deployment, verify by:
1. Checking Railway logs for successful order placement
2. Confirming no more "toFixed()" errors
3. Verifying positions are properly reduced/closed on sell signals

## Emergency Rollback

If issues persist, you can use the alternative `closePositionWithMarketClose` method by updating the pyramid trading engine to call it instead of the standard `placeOrder` method.