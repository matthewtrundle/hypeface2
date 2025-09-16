# Pyramid Trading Bot Test Matrix

## Test Environment
- **Bot URL**: https://hypeface-production.up.railway.app
- **Webhook Endpoint**: /webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec
- **Environment**: TESTNET
- **Wallet**: 0x3D57aF0FeccD210726B5C94E71C6596251EF1339

## Pyramid Configuration
```
entryPercentages: [15, 25, 30, 30]  // % of account per level
leverageLevels: [4, 6, 8, 10]       // leverage per level
maxPyramidLevels: 4
exitPercentages: [25, 25, 25, 25]   // % of position per exit level
```

## Position Sizing Analysis
- **Finding**: Position sizing calculation appears CORRECT
- **Logic**: `positionSize = accountValue * (entryPercentage / 100) * leverage`
- **4.88 SOL position**: Consistent with ~$1140 account value at time of trade

## Test Scenarios

### 1. Fresh Start Test (Clean Slate)
**Objective**: Verify first BUY signal creates correct position size
- [ ] Clear any existing positions
- [ ] Send single BUY signal for SOL-PERP
- [ ] Verify position size matches expected calculation
- [ ] Check Hyperliquid testnet for confirmation

### 2. Pyramid Building Test (Multiple BUY signals)
**Objective**: Verify pyramid levels stack correctly
- [ ] Level 1: Send BUY signal (expect 15% @ 4x leverage)
- [ ] Level 2: Send BUY signal (expect 25% @ 6x leverage)
- [ ] Level 3: Send BUY signal (expect 30% @ 8x leverage)
- [ ] Level 4: Send BUY signal (expect 30% @ 10x leverage)
- [ ] Level 5: Send BUY signal (should be ignored - max levels reached)

### 3. Pyramid Exit Test (SELL signals)
**Objective**: Verify SELL signals reduce position correctly
- [ ] From max pyramid: Send SELL signal (expect 25% position reduction)
- [ ] Send 2nd SELL signal (expect another 25% reduction)
- [ ] Send 3rd SELL signal (expect another 25% reduction)
- [ ] Send 4th SELL signal (expect position fully closed)

### 4. Partial Fill Recovery Test
**Objective**: Verify bot handles partial fills correctly
- [ ] Send BUY signal when market has low liquidity
- [ ] Verify bot tracks actual filled amount vs requested
- [ ] Check position state accuracy

### 5. Position Sync Test
**Objective**: Verify bot syncs with actual Hyperliquid positions
- [ ] Create position manually on Hyperliquid
- [ ] Send SELL signal to bot
- [ ] Verify bot detects and syncs existing position

### 6. Error Handling Test
**Objective**: Verify robust error handling
- [ ] Send invalid webhook (wrong secret)
- [ ] Send BUY signal with insufficient funds
- [ ] Send SELL signal with no position
- [ ] Test network timeout scenarios

### 7. Concurrent Signal Test
**Objective**: Verify bot handles rapid signals correctly
- [ ] Send multiple BUY signals rapidly (within 1 second)
- [ ] Verify only appropriate number are processed
- [ ] Check for race conditions

## Expected Position Sizes by Account Value

| Account Value | Level 1 (15%@4x) | Level 2 (25%@6x) | Level 3 (30%@8x) | Level 4 (30%@10x) | Total SOL |
|---------------|-------------------|-------------------|-------------------|-------------------|-----------|
| $1000         | 4.29 SOL         | 10.71 SOL        | 17.14 SOL        | 21.43 SOL        | 53.57 SOL |
| $1500         | 6.43 SOL         | 16.07 SOL        | 25.71 SOL        | 32.14 SOL        | 80.36 SOL |
| $2000         | 8.57 SOL         | 21.43 SOL        | 34.29 SOL        | 42.86 SOL        | 107.14 SOL |

*Calculations assume SOL price of $140*

## Test Commands

### Single BUY Signal
```bash
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action": "buy", "symbol": "SOL-PERP", "price": 140.50, "strategy": "test", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}'
```

### SELL Signal
```bash
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action": "sell", "symbol": "SOL-PERP", "price": 141.00, "strategy": "test", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}'
```

## Verification Steps

1. **Check Bot Logs**: Monitor Railway logs for processing confirmations
2. **Check Hyperliquid**: Verify positions at https://app.hyperliquid-testnet.xyz/portfolio/0x3D57aF0FeccD210726B5C94E71C6596251EF1339
3. **Check Database**: Query positions table for accurate record keeping
4. **Monitor WebSocket**: Check real-time updates if dashboard is available

## Success Criteria

- [ ] Position sizes match calculated expectations (±2% tolerance)
- [ ] Pyramid levels increment correctly (1, 2, 3, 4)
- [ ] Maximum pyramid levels enforced (no level 5)
- [ ] SELL signals reduce position by correct percentages
- [ ] Full position closure works correctly
- [ ] Bot handles errors gracefully without crashing
- [ ] Database records match Hyperliquid positions
- [ ] WebSocket updates work correctly

## Risk Management

- **Stop Loss**: Monitor for 10% drawdown trigger
- **Account Protection**: Emergency stop if exposure > 5x account value
- **Testnet Only**: All tests on testnet with test funds
- **Position Limits**: Never exceed 4 pyramid levels

## Next Steps After Testing

1. Document all findings and edge cases
2. Fix any discovered bugs
3. Implement additional safety checks if needed
4. Prepare for mainnet deployment checklist
5. Create monitoring and alerting system