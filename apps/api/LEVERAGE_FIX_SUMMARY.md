# Leverage Fix Summary

## Problem Identified
The bot was using 20x leverage (account default on Hyperliquid) instead of the configured 5x leverage, resulting in positions using only 25% of intended margin.

### Root Cause
1. Leverage was being set AFTER placing orders (line ~440 in pyramid-trading-engine.ts)
2. Orders were placed with account's default leverage (20x) before the setLeverage call
3. Result: Position required only $10 margin instead of $40 for first pyramid level

## The Fix

### 1. Order of Operations Fixed (pyramid-trading-engine.ts)
**Before (WRONG):**
```typescript
// Place order
await this.hyperliquidClient!.placeOrder(orderRequest);
// Then set leverage (too late!)
await this.hyperliquidClient!.setLeverage(signal.symbol, 'cross', 5);
```

**After (CORRECT):**
```typescript
// Set leverage FIRST
await this.hyperliquidClient!.setLeverage(signal.symbol, 'cross', 5);
// Then place order with correct margin requirement
await this.hyperliquidClient!.placeOrder(orderRequest);
```

### 2. Error Handling Added
- If leverage setting fails, the order is now ABORTED
- This prevents placing orders with wrong leverage
- Clear error messages in logs

### 3. SDK Method Signature Fixed (hyperliquid-client.ts)
Corrected the updateLeverage call to match SDK:
```typescript
await this.client.exchange.updateLeverage(
  leverage,     // 5
  coin,         // 'SOL-PERP'
  is_cross      // true for cross margin
);
```

## Expected Behavior After Fix

### Pyramid Level Calculations (5x leverage, $400 account):
| Level | Margin % | Margin Used | Position Value | SOL Size |
|-------|----------|-------------|----------------|----------|
| 1     | 10%      | $40         | $200          | ~0.82 SOL |
| 2     | 15%      | $60         | $300          | ~1.22 SOL |
| 3     | 20%      | $80         | $400          | ~1.63 SOL |
| 4     | 25%      | $100        | $500          | ~2.04 SOL |
| **Total** | **70%** | **$280** | **$1,400**    | **~5.71 SOL** |

### What Was Happening (20x leverage bug):
- Level 1: Using only $10 margin (instead of $40)
- Level 2: Using only $15 margin (instead of $60)
- Total margin used: $70 instead of $280

## Deployment Steps

1. **Deploy to Railway:**
   ```bash
   railway up
   ```

2. **Monitor Logs:**
   ```bash
   railway logs | grep -i "leverage"
   ```
   Look for: "Setting leverage to 5x for SOL-PERP" BEFORE "Placing order"

3. **Verify Fix:**
   - Check Hyperliquid UI shows 5x leverage on new positions
   - Verify margin used matches expected values above
   - Monitor first 2-3 trades carefully

## Important Notes

⚠️ **Existing positions maintain their original leverage**
- The fix only affects NEW orders
- Current 20x positions will remain at 20x
- To fix existing positions: close and re-open with new signals

⚠️ **Account default leverage on Hyperliquid may still be 20x**
- The bot now explicitly sets 5x before EACH order
- This overrides the account default
- Each trade will show correct 5x leverage

## Testing Commands

```bash
# Check current implementation
node test-leverage-verification.js

# After deployment, verify positions
node check-position.js

# Monitor real-time logs
railway logs -f | grep -E "(leverage|margin|pyramid)"
```

## Files Modified
1. `/apps/api/src/services/pyramid-trading-engine.ts` - Lines 429-443, 248-261
2. `/apps/api/src/services/hyperliquid-client.ts` - Lines 127-154

## Success Criteria
✅ Logs show "Setting leverage to 5x" BEFORE order placement
✅ Margin used equals configured percentage (10%, 15%, etc.)
✅ Hyperliquid UI shows 5x leverage on new positions
✅ Position sizes match expected calculations
✅ No more 20x leverage positions created