# Quick Aggressive Setup - Deploy in 30 Minutes

## 1. Update Your Trading Engine (5 minutes)

Add to Railway environment variables:
```env
# Aggressive Mode
AGGRESSIVE_MODE=true
ENABLE_PYRAMIDING=true
PYRAMID_LEVELS=30,25,20,15
LEVERAGE_LEVELS=3,4,5,6
MAX_TOTAL_EXPOSURE=90

# Position Management
INITIAL_POSITION=30
SCALE_OUT_PERCENT=25
FLIP_TO_SHORT_AFTER=2

# Risk (wider for pyramiding)
STOP_LOSS_PERCENT=10
TAKE_PROFIT_PERCENT=30
```

## 2. Update Your TradingView Webhooks (5 minutes)

Change your alert message to include confidence:
```json
{
  "action": "{{strategy.order.action}}",
  "symbol": "SOL-USD",
  "price": {{close}},
  "volume": {{volume}},
  "confidence": 75,
  "atr": {{atr}},
  "rsi": {{rsi}}
}
```

## 3. Deploy the Pyramid Manager (10 minutes)

1. Copy the aggressive-pyramid-manager.ts I created
2. Update your webhook handler to use it:

```javascript
// In your webhooks.ts
import { AggressivePyramidManager } from '../services/aggressive-pyramid-manager';

async function handleWebhook(signal) {
  const pyramidManager = new AggressivePyramidManager(prisma, hyperliquid);

  if (signal.action === 'buy') {
    await pyramidManager.handleBuySignal(signal, userId);
  } else {
    await pyramidManager.handleSellSignal(signal, userId);
  }
}
```

## 4. Test with Small Capital First (5 minutes)

```bash
# Test webhook locally
curl -X POST http://localhost:3001/webhooks/tradingview \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "buy",
    "symbol": "SOL-USD",
    "price": 250,
    "confidence": 80
  }'
```

## 5. Monitor Performance

The pyramid manager will:
- **First BUY**: Open 30% position at 3x leverage (90% exposure)
- **Second BUY**: Add 25% at 4x leverage (100% additional exposure)
- **Third BUY**: Add 20% at 5x leverage (100% additional exposure)
- **Fourth BUY**: Add 15% at 6x leverage (90% additional exposure)
- **Total Max**: 380% exposure (90% capital × 4.2x average leverage)

On SELL signals:
- **First SELL**: Reduce 25% of total position
- **Second SELL**: Reduce another 25%
- **Third SELL**: Close remaining and consider short

## When to Upgrade to AI

Add AI when you want:
1. Market context awareness (news, events)
2. Automatic adjustment to volatility
3. Explanation of decisions
4. Cross-market correlation analysis

## Quick AI Addition (Later)

```javascript
// Add this for $10/month
async function getAIConfidence(signal, marketData) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    headers: {
      'Authorization': 'Bearer YOUR_KEY',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3-haiku-20240307',
      messages: [{
        role: 'user',
        content: `
          Signal: ${signal.action} ${signal.symbol} at ${signal.price}
          RSI: ${marketData.rsi}, Volume: ${marketData.volume}
          Recent performance: ${marketData.recentTrades}

          Return confidence 0-100 and reasoning.
        `
      }]
    })
  });

  return response.json();
}
```

## Risk Warning

⚠️ **AGGRESSIVE SETTINGS MEAN**:
- Potential 90% drawdowns
- High volatility in account value
- Need strong psychology
- Must have edge (your 75% win rate)

## Recommended Testing Path

1. **Week 1**: Run with 10% capital max
2. **Week 2**: If profitable, increase to 25%
3. **Week 3**: If still good, go to 50%
4. **Month 2**: Full aggressive mode

## Emergency Stop

Add this safety check:
```javascript
if (accountDrawdown > 30) {
  await closeAllPositions();
  await disableTrading();
  await notifyUser("Emergency stop triggered");
}