# Margin and Leverage System Documentation

## Overview

This document describes the comprehensive margin and leverage management system for the Hyperliquid trading bot. The system ensures safe position sizing, dynamic leverage adjustments, and continuous margin health monitoring.

## System Components

### 1. Margin Calculator (`margin-calculator.ts`)

The core component that handles all margin-related calculations:

- **Position Sizing**: Calculates safe position sizes based on account value and risk parameters
- **Margin Requirements**: Validates that sufficient margin is available before placing orders
- **Health Checks**: Monitors margin usage and provides warnings at different thresholds
- **Pyramid Sizing**: Calculates appropriate sizes for multi-level pyramid positions

#### Key Methods:

```typescript
// Calculate margin requirements for a new position
calculateMarginRequirements(params: PositionSizeParams): MarginRequirements

// Calculate safe position size
calculateSafePositionSize(accountValue, price, marginPct, leverage): number

// Check current margin health
checkMarginHealth(metrics: AccountMetrics): HealthStatus

// Calculate pyramid position sizing
calculatePyramidSize(level, accountValue, price, marginPercentages, leverage): PyramidSize
```

### 2. Leverage Manager (`leverage-manager.ts`)

Manages dynamic leverage adjustments based on market conditions and account health:

- **Optimal Leverage**: Calculates the best leverage for current conditions
- **Auto-Adjustment**: Automatically reduces leverage when risk increases
- **Pyramid Adjustment**: Reduces leverage at higher pyramid levels
- **Volatility Response**: Adjusts leverage based on market volatility

#### Key Methods:

```typescript
// Calculate optimal leverage for new position
calculateOptimalLeverage(client, symbol, pyramidLevel): LeverageDecision

// Monitor and adjust existing positions
monitorAndAdjustLeverage(client, symbol): boolean

// Get leverage recommendations
getLeverageRecommendations(marginRatio): Recommendations
```

### 3. Margin Monitor (`margin-monitor.ts`)

Continuously monitors margin health and takes preventive actions:

- **Real-time Monitoring**: Checks margin health every 5 seconds
- **Alert System**: Generates alerts at different risk levels
- **Emergency Actions**: Automatically closes positions when critical levels are reached
- **WebSocket Updates**: Broadcasts margin status to connected clients

#### Alert Levels:

- **Info (50%)**: Normal operating range
- **Warning (70%)**: High margin usage, monitor closely
- **Critical (85%)**: Consider reducing positions
- **Emergency (95%)**: Immediate action required

## Configuration

### Default Settings

```javascript
// Margin Calculator
MIN_ORDER_SIZE: 0.01        // Minimum position size
MAX_LEVERAGE: 50            // Maximum allowed leverage
DEFAULT_LEVERAGE: 5         // Default leverage
MAINTENANCE_MARGIN: 0.03    // 3% maintenance margin
MARGIN_BUFFER: 0.95         // Use only 95% of available margin
MIN_ACCOUNT_BALANCE: 100    // Minimum $100 balance

// Leverage Manager
baseLeverage: 5             // Starting leverage
maxLeverage: 10            // Maximum for auto-adjustment
minLeverage: 1             // Minimum leverage
marginThreshold: 0.7       // Reduce leverage above 70% margin
autoAdjust: true           // Enable automatic adjustments

// Margin Monitor
THRESHOLDS: {
  info: 0.5,               // 50% margin usage
  warning: 0.7,            // 70% margin usage
  critical: 0.85,          // 85% margin usage
  emergency: 0.95          // 95% margin usage
}
```

### Pyramid Configuration

```javascript
// Margin percentages for each pyramid level
marginPercentages: [10, 15, 20, 25]  // % of account per level

// Fixed leverage for all positions
fixedLeverage: 5

// Maximum account exposure
maxAccountExposure: 0.7  // Never use more than 70% of account
```

## Safety Features

### 1. Position Size Validation

Before opening any position, the system:
- Verifies sufficient account balance
- Checks available margin
- Validates against maximum exposure limits
- Ensures position size meets minimum requirements

### 2. Dynamic Leverage Reduction

Leverage is automatically reduced when:
- Margin usage exceeds 70%
- Market volatility increases
- Higher pyramid levels are reached
- Account health deteriorates

### 3. Emergency Actions

When margin usage exceeds critical levels:
- **85% margin**: Reduces largest position by 50%
- **95% margin**: Closes largest position entirely
- **Cooldown period**: 5 minutes between emergency actions

### 4. Stop Loss Calculation

Stop losses are calculated based on:
- Current leverage
- Maximum acceptable loss percentage
- Entry price and position size

Example:
```
Entry: $250
Leverage: 5x
Max Loss: 10% of margin
Stop Price: $245 (2% price move = 10% margin loss)
```

## Usage Examples

### 1. Calculate Margin Requirements

```javascript
const requirements = marginCalculator.calculateMarginRequirements({
  symbol: 'SOL-PERP',
  accountValue: 10000,
  currentPrice: 250,
  marginPercentage: 10,
  targetLeverage: 5,
  existingMarginUsed: 2000,
  maxExposure: 0.7
});

// Result:
// {
//   requiredMargin: 500,
//   availableMargin: 7600,
//   maxPositionSize: 20,
//   actualPositionSize: 20,
//   leverage: 5,
//   marginRatio: 0.25,
//   isValid: true,
//   warnings: []
// }
```

### 2. Check Margin Health

```javascript
const health = marginCalculator.checkMarginHealth({
  accountValue: 10000,
  totalMarginUsed: 7500,
  totalNtlPos: 37500,
  availableBalance: 2500,
  currentLeverage: 3.75,
  maxAllowedLeverage: 10
});

// Result:
// {
//   isHealthy: false,
//   marginRatio: 0.75,
//   warnings: ['High margin ratio: 75.0%'],
//   requiresAction: false
// }
```

### 3. Get Optimal Leverage

```javascript
const decision = await leverageManager.calculateOptimalLeverage(
  hyperliquidClient,
  'SOL-PERP',
  pyramidLevel = 2
);

// Result:
// {
//   recommendedLeverage: 3.5,
//   currentLeverage: 5,
//   reason: 'Reduced for pyramid level 3',
//   riskLevel: 'medium',
//   shouldReduce: true,
//   maxSafePosition: 14.0
// }
```

## Integration with Pyramid Trading

The margin system is fully integrated with the pyramid trading engine:

1. **Before Buy Signal**:
   - Validates margin requirements
   - Calculates optimal leverage
   - Determines safe position size

2. **During Position Management**:
   - Monitors margin health continuously
   - Adjusts leverage if needed
   - Triggers emergency actions if required

3. **Risk Management**:
   - Implements stop losses
   - Prevents over-leveraging
   - Maintains safe margin ratios

## Testing

Run the comprehensive test suite:

```bash
# Build the TypeScript files first
npm run build

# Run the margin system tests
node test-margin-system.js
```

The test suite covers:
- Margin requirement calculations
- Leverage recommendations
- Safe position sizing
- Pyramid sizing
- Stop loss calculations
- Health checks

## Monitoring and Alerts

### WebSocket Events

The system broadcasts the following events:

```javascript
// Margin status update
{
  type: 'margin_update',
  data: {
    isHealthy: boolean,
    marginRatio: number,
    availableMargin: number,
    alerts: MarginAlert[]
  }
}

// Emergency action taken
{
  type: 'emergency_close',
  symbol: string,
  reason: string,
  marginRatio: number
}
```

### Dashboard Integration

The margin status is displayed in the dashboard:
- Real-time margin ratio gauge
- Alert notifications
- Position adjustment recommendations
- Historical margin usage chart

## Best Practices

1. **Start Conservative**: Begin with lower leverage and increase gradually
2. **Monitor Continuously**: Keep the margin monitor running at all times
3. **Set Appropriate Limits**: Configure max exposure based on risk tolerance
4. **Test Thoroughly**: Use testnet before deploying with real funds
5. **Review Alerts**: Act on warnings before they become critical

## Troubleshooting

### Common Issues

1. **"Insufficient margin" errors**:
   - Check account balance
   - Reduce position size
   - Lower leverage

2. **Frequent emergency closes**:
   - Reduce overall exposure
   - Lower pyramid levels
   - Increase margin buffer

3. **Leverage not adjusting**:
   - Check auto-adjust setting
   - Verify cooldown period
   - Review volatility settings

## Future Enhancements

Planned improvements to the margin system:

1. **Advanced Volatility Calculation**: Use historical price data for accurate volatility
2. **Multi-Asset Support**: Handle different margin requirements per asset
3. **Portfolio Margin**: Implement cross-margining for multiple positions
4. **ML-Based Risk Assessment**: Use machine learning for dynamic risk scoring
5. **Custom Alert Channels**: Support for email/SMS notifications

## Summary

The margin and leverage system provides comprehensive risk management for automated trading on Hyperliquid. By continuously monitoring account health, dynamically adjusting leverage, and implementing emergency safeguards, it helps protect capital while maximizing trading opportunities.

Key benefits:
- ✅ Prevents over-leveraging
- ✅ Automatic risk reduction
- ✅ Real-time monitoring
- ✅ Emergency protection
- ✅ Flexible configuration