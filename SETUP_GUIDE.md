# Hyperliquid Trading Bot Setup Guide

## Current Status: UI Only - Trading Not Connected

The dashboard and authentication system work, but **the bot cannot execute trades yet** because:

1. **No wallet configured** - Using placeholder keys `0x0000...`
2. **Hyperliquid client created but not integrated** - The connection exists but isn't hooked up
3. **Pyramid engine not connected** - Trading logic exists but can't execute

## What Works ✅
- Dashboard UI at https://hype-production.up.railway.app
- Login system (username: `admin`, password: `hyperliquid2024`)
- API endpoints for viewing positions/trades (returns empty data)
- Pyramid trading logic (40-30-20-10% scaling)

## What Doesn't Work ❌
- **No actual trading** - Cannot place orders on Hyperliquid
- **No wallet connection** - No real private key configured
- **Webhook endpoints** - Not connected to trading engine
- **Position tracking** - No real positions to track

## To Make It Actually Work

### 1. Get a Hyperliquid Wallet
```bash
# Generate a new wallet or use existing
# You need the private key (64 hex characters)
```

### 2. Configure Environment Variables in Railway

Add these to your Railway service:

```env
# Replace with your actual private key
WALLET_PRIVATE_KEY=your_actual_private_key_here

# Use mainnet for real trading
HYPERLIQUID_API_URL=https://api.hyperliquid.xyz

# Or testnet for testing
# HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz
```

### 3. Connect the Trading Engine

The files exist but need integration:
- `/apps/api/src/services/hyperliquid-client.ts` - Exchange connection
- `/apps/api/src/services/pyramid-trading-engine.ts` - Trading logic
- `/apps/api/src/routes/webhooks.ts` - Signal reception

### 4. Initialize the Hyperliquid Client

In `/apps/api/src/app.ts`, add:

```typescript
import { HyperliquidClient } from './services/hyperliquid-client';

// Initialize after database connection
const hlClient = new HyperliquidClient({
  privateKey: process.env.WALLET_PRIVATE_KEY!,
  isTestnet: process.env.HYPERLIQUID_API_URL?.includes('testnet') || false
});

await hlClient.initialize();

// Pass to pyramid engine
pyramidEngine.setHyperliquidClient(hlClient);
```

### 5. Test with Small Amounts

1. Start with testnet first
2. Use minimal position sizes (0.001 ETH)
3. Monitor the logs carefully
4. Verify orders appear on Hyperliquid

## Quick Test Commands

```bash
# Check if wallet is configured (locally)
curl http://localhost:3001/api/wallet/balance

# Send test signal (locally)
curl -X POST http://localhost:3001/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -d '{"action":"buy","symbol":"ETH","strategy":"test"}'

# Check positions
curl http://localhost:3001/api/positions
```

## Architecture Overview

```
TradingView Webhook
        ↓
    API Server (Railway)
        ↓
  Pyramid Engine (40-30-20-10%)
        ↓
  Hyperliquid Client ← [MISSING: Real wallet key]
        ↓
    Hyperliquid DEX
```

## Bottom Line

**You have a nice dashboard but no actual trading capability yet.** To make it work:

1. **Add your private key** to Railway environment variables
2. **Initialize the Hyperliquid client** in the app startup
3. **Connect the pyramid engine** to the client
4. **Test carefully** with small amounts on testnet first

Without these steps, it's just a UI showing empty data.