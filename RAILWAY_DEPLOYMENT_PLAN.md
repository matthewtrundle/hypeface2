# 🚀 Railway Deployment Plan - Step-by-Step Guide

## Prerequisites Checklist
- [x] Code pushed to GitHub: `https://github.com/matthewtrundle/hype.git`
- [ ] Railway account created: https://railway.app
- [ ] Railway CLI installed: `npm install -g @railway/cli`
- [ ] TradingView account for webhooks
- [ ] Hyperliquid testnet account

---

## 📋 Step 1: Railway Project Setup

### 1.1 Login to Railway
```bash
railway login
```

### 1.2 Create New Project
```bash
# Option A: Create from CLI
railway init
# Enter project name: hyperliquid-trading-bot

# Option B: Create from Dashboard
# Go to https://railway.app/new
```

### 1.3 Connect GitHub Repository
1. Go to Railway Dashboard → Your Project
2. Click "Deploy" → "GitHub Repo"
3. Select `matthewtrundle/hype`
4. Choose branch: `main`
5. Enable "Auto Deploy" for automatic deployments

---

## 🗄️ Step 2: Database Setup

### 2.1 Add PostgreSQL Database
```bash
# In Railway Dashboard:
1. Click "New Service" → "Database" → "PostgreSQL"
2. Railway automatically creates DATABASE_URL environment variable
```

### 2.2 Add Redis Cache
```bash
# In Railway Dashboard:
1. Click "New Service" → "Database" → "Redis"
2. Railway automatically creates REDIS_URL environment variable
```

### 2.3 Database Migrations (After First Deploy)
```bash
# Run migrations on Railway's PostgreSQL
railway run npm run db:migrate

# Generate Prisma client
railway run npm run db:generate

# Seed test user (optional)
railway run npm run db:seed
```

---

## 🔐 Step 3: Environment Variables

### 3.1 Generate Security Keys
```bash
# Generate JWT Secret (32+ characters)
openssl rand -base64 32
# Example: K7FqX8JzR9vNmP4sT2wL6hY3aB5eC1gD0iU9oQ7nE8M=

# Generate Master Encryption Key (32+ characters)
openssl rand -base64 32
# Example: X9mK3pL7nB5vC1zQ8wE6rT4yU2iO0aS9dF7gH5jK3lM=

# Generate Webhook Secret
openssl rand -hex 20
# Example: a3f7b9e2c5d8a1f4e7b0c3d6a9f2e5b8c1d4e7a0
```

### 3.2 Create Test Wallet
```bash
# Run locally first to generate wallet
node scripts/create-test-wallet.js

# Output will show:
# WALLET_PUBLIC_KEY="0x..."
# WALLET_PRIVATE_KEY="encrypted..."
# MASTER_ENCRYPTION_KEY="..."
```

### 3.3 Set Environment Variables in Railway

Go to Railway Dashboard → Variables, add these:

```env
# === DATABASE (Auto-provided by Railway) ===
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# === SECURITY (CHANGE ALL OF THESE!) ===
JWT_SECRET=K7FqX8JzR9vNmP4sT2wL6hY3aB5eC1gD0iU9oQ7nE8M=
MASTER_ENCRYPTION_KEY=X9mK3pL7nB5vC1zQ8wE6rT4yU2iO0aS9dF7gH5jK3lM=
WEBHOOK_SECRET=a3f7b9e2c5d8a1f4e7b0c3d6a9f2e5b8c1d4e7a0

# === HYPERLIQUID (Start with Testnet) ===
HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz
HYPERLIQUID_MAINNET_URL=https://api.hyperliquid.xyz

# === WALLET (From create-test-wallet.js) ===
WALLET_PUBLIC_KEY=0x0000000000000000000000000000000000000000
WALLET_PRIVATE_KEY=encrypted-private-key-from-script

# === TRADING CONFIGURATION ===
POSITION_SIZE_PERCENTAGE=10
MAX_LEVERAGE=5
STOP_LOSS_PERCENTAGE=5
TAKE_PROFIT_PERCENTAGE=10

# === APPLICATION ===
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# === FRONTEND URLs (Railway provides) ===
FRONTEND_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_API_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_WS_URL=wss://${{RAILWAY_PUBLIC_DOMAIN}}
```

---

## 🚂 Step 4: Deploy to Railway

### 4.1 Initial Deploy
```bash
# Deploy from CLI
railway up

# OR let auto-deploy handle it after GitHub push
git push origin main
```

### 4.2 Monitor Deployment
```bash
# Watch logs
railway logs -f

# Check deployment status
railway status
```

### 4.3 Run Database Setup
```bash
# After first deployment, run migrations
railway run npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

# Create test user
railway run npx prisma db seed --schema=apps/api/prisma/schema.prisma
```

---

## ✅ Step 5: Verify Deployment

### 5.1 Check Health Endpoint
```bash
# Get your Railway URL
railway open

# Test health endpoint
curl https://your-app.railway.app/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-13T...",
  "services": {
    "database": true,
    "redis": true
  }
}
```

### 5.2 Test Login
1. Open: `https://your-app.railway.app`
2. Login with test credentials:
   - Email: `test@example.com`
   - Password: `testpassword`

---

## 📡 Step 6: Configure TradingView Webhooks

### 6.1 Create Alert in TradingView
1. Open TradingView chart
2. Create alert with your strategy
3. In "Webhook URL" field, enter:
   ```
   https://your-app.railway.app/webhooks/tradingview
   ```

### 6.2 Configure Message Format
```json
{
  "action": "{{strategy.order.action}}",
  "symbol": "{{ticker}}",
  "strategy": "{{strategy.name}}",
  "timestamp": {{timenow}}
}
```

### 6.3 Add Webhook Headers
```
X-Webhook-Secret: your-webhook-secret-from-env
X-Webhook-Timestamp: {{timenow}}
```

---

## 🧪 Step 7: Test the Bot

### 7.1 Test with Mock Webhook
```bash
# SSH into Railway
railway run bash

# Run test webhook
curl -X POST https://your-app.railway.app/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{"action": "buy", "symbol": "BTC-USD", "strategy": "test"}'
```

### 7.2 Monitor Logs
```bash
# Watch for trading activity
railway logs -f | grep -E "signal|position|trade"
```

---

## 💰 Step 8: Fund Testnet Account

### 8.1 Get Testnet Funds
1. Go to: https://app.hyperliquid-testnet.xyz/drip
2. Request test USDC
3. Verify balance in dashboard

### 8.2 Test First Trade
1. Send buy signal from TradingView or test webhook
2. Monitor dashboard for position opening
3. Send sell signal to close position
4. Check P&L in dashboard

---

## 🚨 Step 9: Production Checklist

Before going live with real money:

- [ ] Generate NEW production wallet (never reuse test wallet)
- [ ] Change all security keys (JWT, encryption, webhook)
- [ ] Switch to Hyperliquid mainnet URL
- [ ] Test stop-loss and risk management
- [ ] Set conservative position sizes (start with 1-5%)
- [ ] Enable monitoring and alerts
- [ ] Backup wallet seed phrase securely
- [ ] Document emergency shutdown procedure

---

## 📊 Step 10: Monitoring & Maintenance

### 10.1 Setup Monitoring
```bash
# Check system health regularly
railway logs --tail 100 | grep ERROR

# Monitor database size
railway run npx prisma studio
```

### 10.2 Regular Maintenance
```bash
# Weekly: Check logs for errors
railway logs --since 7d | grep -E "error|failed"

# Monthly: Database cleanup
railway run npx prisma db execute --schema=apps/api/prisma/schema.prisma \
  --command "DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'"

# Backup database
railway run pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## 🆘 Troubleshooting

### Common Issues & Solutions

#### Database Connection Failed
```bash
# Check DATABASE_URL
railway variables

# Test connection
railway run npx prisma db pull --schema=apps/api/prisma/schema.prisma
```

#### Build Failures
```bash
# Clear cache and rebuild
railway up --no-cache

# Check build logs
railway logs --build
```

#### WebSocket Not Connecting
```bash
# Verify environment variables
railway run env | grep WS_URL

# Check CORS settings
railway run cat apps/api/src/app.ts | grep FRONTEND_URL
```

---

## 🎯 Quick Deploy Commands

```bash
# Complete deployment from scratch
git clone https://github.com/matthewtrundle/hype.git
cd hype
railway login
railway init
railway up

# After deployment
railway run npm run db:migrate
railway run npm run db:seed
railway open
```

---

## 📝 SQL Commands for Manual Database Setup

If you need to manually set up the database:

```sql
-- Create database (if not auto-created)
CREATE DATABASE hyperliquid_bot;

-- Connect to database
\c hyperliquid_bot;

-- Run Prisma migrations
-- This is handled by: railway run npm run db:migrate

-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Check for test user
SELECT * FROM users WHERE email = 'test@example.com';

-- Monitor recent trades
SELECT * FROM trades ORDER BY executed_at DESC LIMIT 10;

-- Check open positions
SELECT * FROM positions WHERE status = 'open';

-- View system health
SELECT * FROM system_logs
WHERE level = 'error'
AND created_at > NOW() - INTERVAL '1 hour';
```

---

## ✅ Deployment Complete!

Your bot should now be running on Railway with:
- ✅ Automatic deployments from GitHub
- ✅ PostgreSQL database with migrations
- ✅ Redis for caching and queues
- ✅ Health monitoring
- ✅ WebSocket real-time updates
- ✅ Secure webhook handling
- ✅ Long-only trading strategy

**Next Steps:**
1. Test with small amounts on testnet
2. Monitor for 24-48 hours
3. Gradually increase position sizes
4. Switch to mainnet when confident

**Support:**
- Railway Dashboard: https://railway.app/project/[your-project-id]
- Logs: `railway logs -f`
- Database: `railway run npx prisma studio`
- Health: `https://your-app.railway.app/health`