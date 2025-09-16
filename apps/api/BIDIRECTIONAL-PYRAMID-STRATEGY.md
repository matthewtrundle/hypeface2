# Bidirectional Pyramid Trading Strategy

## Overview
Enhance the pyramid trading bot to handle both long and short positions with pyramid scaling.

## Current Behavior
- **BUY Signal**: Opens/increases LONG position
- **SELL Signal**: Closes LONG position

## Proposed Behavior
- **BUY Signal**:
  - If SHORT position exists: Close it completely
  - Then: Open/pyramid LONG position
- **SELL Signal**:
  - If LONG position exists: Close it completely
  - Then: Open/pyramid SHORT position

## Position Management Rules

### Hyperliquid Constraints
- **Cannot have both long and short on same asset** - positions net out
- When flipping from long to short (or vice versa), must:
  1. Close existing position
  2. Open new position in opposite direction

### Pyramid Structure for Shorts
Same pyramid levels as longs:
- Level 1: 15% @ 4x leverage
- Level 2: 25% @ 6x leverage
- Level 3: 30% @ 8x leverage
- Level 4: 30% @ 10x leverage

## Implementation Strategy

### State Management
```typescript
interface PyramidState {
  symbol: string;
  direction: 'long' | 'short' | 'flat';  // Track position direction
  entryCount: number;
  exitCount: number;
  currentSize: number;
  averageEntry: number;
  totalCapitalUsed: number;
  positions: Array<{
    size: number;
    entry: number;
    leverage: number;
    timestamp: Date;
  }>;
}
```

### Signal Processing Logic

#### BUY Signal Flow
```typescript
async handleBuySignal() {
  // 1. Check current position direction
  if (state.direction === 'short') {
    // Close entire short position
    await closePosition(state.currentSize, 'short');
    // Reset pyramid state
    state = resetPyramidState();
  }

  // 2. Open/add to long position
  if (state.entryCount < maxPyramidLevels) {
    const level = state.entryCount + 1;
    await openLongPosition(level);
    state.direction = 'long';
    state.entryCount++;
  }
}
```

#### SELL Signal Flow
```typescript
async handleSellSignal() {
  // 1. Check current position direction
  if (state.direction === 'long') {
    // Close entire long position
    await closePosition(state.currentSize, 'long');
    // Reset pyramid state
    state = resetPyramidState();
  }

  // 2. Open/add to short position
  if (state.entryCount < maxPyramidLevels) {
    const level = state.entryCount + 1;
    await openShortPosition(level);
    state.direction = 'short';
    state.entryCount++;
  }
}
```

## Order Execution

### Opening Short Position
```typescript
const orderRequest: OrderRequest = {
  coin: signal.symbol,
  is_buy: false,  // FALSE for short
  sz: sizeInAsset,
  limit_px: limitPrice,
  order_type: 'limit',
  reduce_only: false
};
```

### Closing Positions
```typescript
// Close long (sell to close)
const closeLong: OrderRequest = {
  coin: symbol,
  is_buy: false,
  sz: currentSize,
  limit_px: marketPrice * 0.999,
  order_type: 'limit',
  reduce_only: true  // Important: reduce only
};

// Close short (buy to close)
const closeShort: OrderRequest = {
  coin: symbol,
  is_buy: true,
  sz: currentSize,
  limit_px: marketPrice * 1.001,
  order_type: 'limit',
  reduce_only: true  // Important: reduce only
};
```

## Risk Management

### Position Flipping Protection
- Add cooldown period between closing and opening opposite position
- Verify position is fully closed before opening opposite
- Handle partial fills gracefully

### Maximum Exposure
- Track total exposure across both directions
- Implement daily loss limits
- Add circuit breakers for rapid position flipping

## Testing Scenarios

### Scenario 1: Long to Short Flip
1. BUY signal → Open long position (Level 1)
2. BUY signal → Pyramid long (Level 2)
3. SELL signal → Close entire long, open short (Level 1)
4. SELL signal → Pyramid short (Level 2)

### Scenario 2: Short to Long Flip
1. SELL signal → Open short position (Level 1)
2. SELL signal → Pyramid short (Level 2)
3. BUY signal → Close entire short, open long (Level 1)
4. BUY signal → Pyramid long (Level 2)

### Scenario 3: Max Pyramiding
1. BUY → Long Level 1
2. BUY → Long Level 2
3. BUY → Long Level 3
4. BUY → Long Level 4
5. BUY → No action (max reached)
6. SELL → Close all, Short Level 1

## Database Schema Updates

### Position Table
```sql
ALTER TABLE positions ADD COLUMN side ENUM('long', 'short');
ALTER TABLE positions ADD COLUMN pyramid_level INT DEFAULT 1;
```

### Signal Metadata
Track position flips in signal metadata:
```json
{
  "action": "sell",
  "flipped_from": "long",
  "closed_size": 4.88,
  "new_position": "short",
  "pyramid_level": 1
}
```

## Safety Features

1. **Position Verification**: Always query Hyperliquid for actual position before executing
2. **Slippage Protection**: Use limit orders with reasonable slippage tolerance
3. **Emergency Stop**: Admin endpoint to halt all trading
4. **Position Sync**: Regular sync between local state and exchange state

## Implementation Priority

### Phase 1 (Immediate)
- Add direction tracking to PyramidState
- Implement position closing logic
- Update handleSellSignal to open shorts

### Phase 2 (Testing)
- Comprehensive testnet testing
- Position flip scenarios
- Pyramid level verification

### Phase 3 (Production)
- Deploy with reduced leverage initially
- Monitor position flips carefully
- Gradual increase to full pyramid levels

## Configuration

```typescript
const config = {
  enableShorts: true,  // Feature flag
  flipCooldown: 5000,  // 5 seconds between flips
  maxDailyFlips: 10,   // Limit rapid flipping
  shortLeverage: [2, 3, 4, 5],  // Conservative for shorts
  longLeverage: [4, 6, 8, 10]   // Current long leverage
};
```