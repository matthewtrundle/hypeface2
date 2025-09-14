# Advanced Trading Strategy Configuration

## Based on Your 75.81% Win Rate Strategy

### 1. Position Sizing Formula
```javascript
function calculatePositionSize(account, winRate, currentStreak, volatility) {
  const baseSize = 0.15; // 15% base
  const kellyFraction = 0.25; // Conservative Kelly

  // Win rate adjustment
  const winRateMultiplier = Math.min(1.5, winRate / 0.5);

  // Streak adjustment
  const streakBonus = currentStreak > 5 ? 1.25 : 1.0;
  const streakPenalty = currentStreak < -3 ? 0.5 : 1.0;

  // Volatility adjustment (inverse)
  const volAdjustment = Math.max(0.5, Math.min(1.5, 1 / volatility));

  const finalSize = baseSize * winRateMultiplier * streakBonus * streakPenalty * volAdjustment;

  return Math.min(0.25, Math.max(0.05, finalSize)); // Cap between 5-25%
}
```

### 2. Dynamic Leverage Calculation
```javascript
function calculateLeverage(signal, marketConditions) {
  const baseLeverage = 3;

  // Signal strength (you can pass this from TradingView)
  const signalMultiplier = {
    'strong_buy': 1.5,   // 4.5x
    'buy': 1.0,          // 3x
    'weak_buy': 0.67,    // 2x
  }[signal.strength] || 1.0;

  // Market trend alignment
  const trendMultiplier = marketConditions.trending ? 1.2 : 0.8;

  // Volatility inverse (lower leverage in high volatility)
  const volMultiplier = marketConditions.volatility < 0.02 ? 1.2 :
                        marketConditions.volatility > 0.05 ? 0.7 : 1.0;

  const leverage = baseLeverage * signalMultiplier * trendMultiplier * volMultiplier;

  return Math.min(5, Math.max(1, Math.round(leverage))); // 1x to 5x
}
```

### 3. Risk Management Rules

#### Entry Rules:
- **Maximum Risk per Trade**: 2% of account
- **Maximum Open Positions**: 3 (to avoid overexposure)
- **Correlation Check**: Don't open similar positions (BTC + ETH together)

#### Exit Rules:
- **Stop Loss**: -5% (with leverage, this is -15% position loss at 3x)
- **Take Profit Levels**:
  - TP1: +10% (take 50% off)
  - TP2: +20% (take 25% off)
  - TP3: Let it run with trailing stop

#### Drawdown Management:
```javascript
if (drawdown > 10%) {
  positionSize *= 0.5;
  maxLeverage = 3;
}
if (drawdown > 20%) {
  positionSize *= 0.25;
  maxLeverage = 2;
  requireStrongerSignals = true;
}
```

### 4. TradingView Alert Format

For dynamic signals, use this webhook format:

```json
{
  "action": "buy",
  "symbol": "SOL-USD",
  "price": {{close}},
  "signalStrength": "strong", // strong/normal/weak
  "confidence": {{strategy.confidence}}, // 0-100
  "atr": {{atr}},
  "trend": "{{trend}}", // up/down/sideways
  "leverage": {{strategy.leverage}}, // optional override
  "stopLoss": {{strategy.stop}},
  "takeProfit": {{strategy.target}}
}
```

### 5. Environment Variables for Railway

Add these to your HypeFace service:

```env
# Position Management
POSITION_SIZE_BASE=15
POSITION_SIZE_MIN=5
POSITION_SIZE_MAX=25
USE_KELLY_CRITERION=true
KELLY_FRACTION=0.25

# Leverage Management
LEVERAGE_BASE=3
LEVERAGE_MIN=1
LEVERAGE_MAX=5
LEVERAGE_DYNAMIC=true

# Risk Management
MAX_DRAWDOWN=20
STOP_LOSS_PERCENT=5
TAKE_PROFIT_1=10
TAKE_PROFIT_2=20
TRAILING_STOP=true
TRAILING_STOP_PERCENT=5

# Signal Filtering
MIN_CONFIDENCE=60
REQUIRE_TREND_ALIGNMENT=true
MAX_POSITIONS=3
```

### 6. Performance Metrics to Track

Your bot should track:
- Rolling 30-day win rate
- Average win/loss ratio
- Maximum drawdown
- Sharpe ratio
- Current streak
- Volatility (ATR-based)

These feed back into the position sizing algorithm.

### 7. Backtesting Results Interpretation

From your screenshots:
- **75.81% Win Rate**: Exceptional, allows for larger position sizes
- **464% ROI**: Strong edge, but ensure this isn't overfit
- **613/616 trades**: Good sample size for statistical significance
- **3x Leverage**: Appropriate given the win rate

### Recommended Starting Configuration:
- Start with 10% position size
- 2-3x leverage
- Increase gradually as you verify live performance matches backtest
- Always use stop losses
- Never risk more than 2% per trade (position size / leverage)