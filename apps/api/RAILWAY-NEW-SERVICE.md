# Railway New Service Migration Guide

## Why Create New Service?
Railway has severe caching issues that prevent updated code from running, even after:
- Multiple deployments
- Railway restart commands
- Cache invalidation attempts
- Version-tagged deployments

## Step-by-Step Migration

### 1. Create New Service
```bash
railway service create hypeface-api-fresh
```

### 2. Connect to Existing Databases
You need to connect the new service to your existing PostgreSQL and Redis instances:

#### Option A: Via Railway Dashboard (Easier)
1. Go to Railway dashboard
2. Open your project
3. Click on the new service "hypeface-api-fresh"
4. Go to Variables tab
5. Add these from the old service:
   - DATABASE_URL (connects to existing PostgreSQL)
   - REDIS_URL (connects to existing Redis)
   - All other environment variables

#### Option B: Via CLI
```bash
# Get variables from old service
railway link  # Select old service
railway variables --json > old-vars.json

# Set on new service
railway link  # Select new service
railway variables set DATABASE_URL="[copy from old]"
railway variables set REDIS_URL="[copy from old]"
# ... copy all other variables
```

### 3. Required Environment Variables
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
MASTER_ENCRYPTION_KEY=...
WEBHOOK_SECRET=3e8e55210be930325825be0b2b204f43f558baec
WALLET_PRIVATE_KEY=...
POSITION_SIZE_PERCENTAGE=70
MAX_LEVERAGE=5
NODE_ENV=production
PORT=3001
```

### 4. Deploy Fresh Code
```bash
# Ensure you're in /apps/api directory
cd /Users/mattrundle/Documents/hype/apps/api

# Link to new service
railway link  # Select "hypeface-api-fresh"

# Deploy
railway up
```

### 5. Get New URL
```bash
railway domain
```
The new service will have a different URL like:
`https://hypeface-api-fresh-production.up.railway.app`

### 6. Update TradingView Webhooks
Update your TradingView alerts to use the new webhook URL:
```
https://[new-domain]/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec
```

### 7. Test New Deployment
```bash
# Test webhook endpoint
curl -X POST "https://[new-domain]/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action": "buy", "symbol": "SOL-PERP", "price": 240.00}'
```

### 8. Clean Up Old Service
Once confirmed working:
```bash
railway service delete hypeface-api
```

## Current Open Position
You have an open position of 4.3 SOL that needs to be closed. After migrating to the new service, test the sell signals to close it.

## Testing Commands
```bash
# Test sell signal (50% first)
./test-webhooks.sh sell

# Test full cycle
./test-webhooks.sh buy
./test-webhooks.sh sell
./test-webhooks.sh sell  # Should close position
```