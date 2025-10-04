# 🎯 PERP-ONLY SIGNAL ANALYSIS

## FARTCOIN-PERP Signals (Recent)

### October 2, 2025
```
19:17 UTC (14:17 EST) - SELL @ 0.02993
15:01 UTC (10:01 EST) - BUY  @ 0.02638
13:49 UTC (08:49 EST) - BUY  @ 0.02916  ← 17 min after previous!
13:32 UTC (08:32 EST) - BUY  @ 0.02940
04:19 UTC (23:19 EST) - SELL @ 0.02884
03:05 UTC (22:05 EST) - SELL @ 0.02688  ← 1h14m after previous
```

### October 1, 2025
```
23:00 UTC (18:00 EST) - BUY  @ 0.02297
21:31 UTC (16:31 EST) - BUY  @ 0.02387
18:16 UTC (13:16 EST) - BUY  @ 0.02452
16:00 UTC (11:00 EST) - SELL @ 0.02574
10:00 UTC (05:00 EST) - SELL @ 0.02604
07:15 UTC (02:15 EST) - BUY  @ 0.02197
```

## ACTUAL TRADES vs SIGNALS (FARTCOIN)

### Trade History
```
10/2 08:32 - LONG 250.3 FARTCOIN  ← Signal 13:32 UTC ✓
10/2 08:49 - LONG 477.0 FARTCOIN  ← Signal 13:49 UTC ✓ (17 min later!)
10/2 14:17 - CLOSE 727.3 FARTCOIN ← Signal 19:17 UTC ✓
```

**ISSUE FOUND**: 17 minutes between BUY signals → Both executed → Pyramiding!

## SOL-PERP Pattern (Estimated from Trade History)

### October 2, 2025 SHORT Entries
```
Time (EST)   Size    Price    Likely Signal Source
────────────────────────────────────────────────────
00:30       1.43    $225.71  ← KUCOIN 30m SELL
08:03       1.41    $227.04  ← KUCOIN 30m SELL
11:37       1.37    $227.27  ← KUCOIN 30m SELL (3.5h later)
12:30       0.42    $228.83  ← KUCOIN 30m SELL (53min later!)
14:00       REJECTED         ← KUCOIN 30m SELL (insufficient margin)
14:36       1.30    $231.82  ← KUCOIN 30m SELL (recovered margin)
```

## 🔴 CRITICAL FINDINGS

### 1. **Rapid-Fire Pyramiding on Same Trend**
- **FARTCOIN**: 13:32 BUY → 13:49 BUY (17 minutes)
  - Result: 250 FARTCOIN + 477 FARTCOIN = 727 total
  - This is PYRAMID LEVEL 1 and 2 fired within 17 minutes!

### 2. **SOL Over-Pyramiding**
- 5 SHORT entries in 14 hours (Oct 2)
- Each signal added a new pyramid level
- No price improvement requirement
- Hit max levels → Started getting rejections

### 3. **Position Sizing Math**
With `aggressive` config (30%, 35%, 40%, 45%):
```
Entry 1: 30% × 3x = 90% account exposure
Entry 2: 35% × 3x = 105% account exposure
Entry 3: 40% × 3x = 120% account exposure
Entry 4: 45% × 3x = 135% account exposure
────────────────────────────────────────────
TOTAL: 450% potential exposure (!!)
```

### 4. **Signal Frequency Reality**
- **FARTCOIN alerts**: Every 1-6 hours (15m timeframe)
- **SOL alerts**: Every 30min-7 hours (30m timeframe)
- **NOT spam** - but bot treats EVERY signal as "add more"

## ⚠️ ROOT CAUSE

The pyramid engine adds a new level on **EVERY signal** of the same direction:
```typescript
// pyramid-trading-engine.ts:429-433
if (state.currentLevel >= this.config.maxPyramidLevels) {
  logger.info(`Max pyramid level reached`);
  return;
}
// Otherwise: ADD MORE!
```

**No checks for**:
- ❌ Is existing position profitable?
- ❌ Has price moved favorably since last entry?
- ❌ Time since last pyramid entry?
- ❌ Total margin usage across all positions?

## 📊 EXPECTED vs ACTUAL BEHAVIOR

### **What SHOULD Happen** (Proper Pyramid)
```
BUY @ $100 → Entry 1 (1x position)
Price moves to $102 → BUY signal → Entry 2 (add to winner)
Price moves to $105 → BUY signal → Entry 3 (add more)
SELL signal → Take 50% profit
SELL signal → Close remaining
```

### **What's ACTUALLY Happening**
```
BUY @ $100 → Entry 1
BUY @ $100 (same price!) → Entry 2 (17 min later!)
BUY @ $99 (UNDERWATER!) → Entry 3
BUY @ $98 (MORE underwater!) → Entry 4
Account margin: 450% used
Next signal: REJECTED (no margin)
```

This is **averaging down**, not pyramiding!

## 💡 SOLUTION REQUIREMENTS

### 1. **Add Pyramid Entry Conditions**
Only add pyramid level if:
- Previous entry is in profit (price moved 0.5%+ favorable)
- OR minimum 1 hour since last entry
- AND total margin usage < 50%

### 2. **Reduce Aggressive Sizing**
Change to `moderate` or create `safe`:
```
safe: {
  marginPercentages: [10, 10, 10, 10],  // 40% total
  fixedLeverage: 2  // Lower risk
}
```

### 3. **Add Signal Cooldown**
```
const lastSignalTime = await redis.get(`lastSignal:${symbol}:${action}`);
if (Date.now() - lastSignalTime < 15 * 60 * 1000) {  // 15 min
  logger.info('Signal too soon, skipping');
  return;
}
```

### 4. **Require Price Improvement**
```
if (state.currentLevel > 0) {
  const lastEntry = state.averageEntryPrice;
  const currentPrice = await getMarketPrice(symbol);

  if (action === 'buy' && currentPrice >= lastEntry * 1.005) {
    logger.info('Price hasnt moved favorably, skipping pyramid');
    return;
  }
}
```
