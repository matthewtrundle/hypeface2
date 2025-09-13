# Railway Deployment Guide - OPTIMIZED

This project is **fully optimized** for Railway deployment with automatic database provisioning, health checks, and production-ready configuration.

## 🚀 One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

## 📋 Prerequisites

1. Railway account (https://railway.app)
2. Railway CLI installed: `npm install -g @railway/cli`
3. GitHub repository with your code

## 🔧 Railway Setup Steps

### 1. Create New Project

```bash
# Login to Railway
railway login

# Create new project
railway init

# Link to existing project (if needed)
railway link
```

### 2. Provision Services

Railway will automatically detect and provision:
- **PostgreSQL** database
- **Redis** instance
- **Web** service (API)
- **Worker** service (Trading Engine)

Or manually add via Dashboard:
1. Click "New Service"
2. Select PostgreSQL
3. Click "New Service"
4. Select Redis

### 3. Configure Environment Variables

In Railway Dashboard → Variables:

```env
# Database (Auto-provided by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Security (MUST CHANGE!)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
MASTER_ENCRYPTION_KEY=your-32-character-encryption-key-change-this
WEBHOOK_SECRET=your-webhook-secret-from-tradingview

# Hyperliquid - START WITH TESTNET
HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz
HYPERLIQUID_MAINNET_URL=https://api.hyperliquid.xyz

# Wallet (Generate new for production!)
WALLET_PUBLIC_KEY=0x...your-wallet-address
WALLET_PRIVATE_KEY=encrypted-private-key-here

# Trading Config
POSITION_SIZE_PERCENTAGE=10
MAX_LEVERAGE=10
STOP_LOSS_PERCENTAGE=5
TAKE_PROFIT_PERCENTAGE=10

# Frontend URL (Railway provides)
FRONTEND_URL=https://${{RAILWAY_STATIC_URL}}
NEXT_PUBLIC_API_URL=https://${{RAILWAY_STATIC_URL}}
NEXT_PUBLIC_WS_URL=wss://${{RAILWAY_STATIC_URL}}

# Monitoring
LOG_LEVEL=info
NODE_ENV=production
```

### 4. Deploy from GitHub

Connect GitHub repo in Railway:
1. Settings → GitHub
2. Connect repository
3. Select branch (main/master)
4. Enable automatic deploys

### 5. Deploy from CLI

```bash
# Deploy current directory
railway up

# Deploy with specific environment
railway up --environment production

# View deployment logs
railway logs

# Open deployed app
railway open
```

## 🏗️ Railway Configuration Files

The project includes optimized Railway configs:

### `railway.toml` (Main config)
- Nixpacks builder configuration
- Health check endpoints
- Auto-restart policies
- Region selection (us-west1)

### `nixpacks.toml` (Build config)
- Node.js 20 runtime
- Prisma generation
- Production build commands

### `Procfile` (Process types)
- Web: API server with migrations
- Worker: Trading engine

## 🔍 Service Architecture on Railway

```
Railway Project
├── PostgreSQL Database (Automatic)
├── Redis Cache (Automatic)
├── Web Service (API + Dashboard)
│   ├── Port: 3001
│   ├── Health: /health
│   └── Auto-restart on failure
└── Environment Variables (Shared)
```

## 📊 Railway Dashboard Features

- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Deployments**: Git-triggered deploys
- **Domains**: Custom domains or Railway-provided
- **Scaling**: Vertical scaling (horizontal coming)

## 🚨 Production Checklist

### Before Deploy:
- [ ] Generate NEW wallet for production
- [ ] Set strong JWT_SECRET (32+ chars)
- [ ] Set unique MASTER_ENCRYPTION_KEY
- [ ] Configure TradingView webhook secret
- [ ] Test on Hyperliquid testnet first

### After Deploy:
- [ ] Run database migrations: `railway run npm run db:migrate`
- [ ] Seed initial data: `railway run npm run db:seed`
- [ ] Test health endpoint: `https://your-app.railway.app/health`
- [ ] Test webhook endpoint
- [ ] Monitor logs: `railway logs -f`

## 🔧 Optimizations for Railway

### 1. **Database Migrations**
Automatically runs on deploy via start command

### 2. **Health Checks**
- Endpoint: `/health`
- Checks: Database, Redis, API
- Auto-restart on failure

### 3. **Resource Optimization**
- Build caching enabled
- Node modules cached
- Prisma client pre-generated

### 4. **Environment Detection**
- Automatic production mode
- Railway-specific URLs used
- SSL/TLS handled by Railway

### 5. **Logging**
- Structured JSON logs
- Error tracking ready
- Log levels by environment

## 🛠️ Troubleshooting

### Build Failures
```bash
# Check build logs
railway logs --build

# Clear cache and rebuild
railway up --no-cache
```

### Database Issues
```bash
# Connect to database
railway run npx prisma studio

# Run migrations manually
railway run npm run db:migrate

# Reset database (CAUTION!)
railway run npx prisma migrate reset
```

### Connection Issues
```bash
# Check service status
railway status

# Restart service
railway restart

# View environment variables
railway variables
```

## 📈 Monitoring

### Railway Metrics
- CPU usage < 80%
- Memory < 512MB (free tier)
- Response time < 200ms
- Error rate < 1%

### Application Metrics
- Position updates: Real-time
- Trade execution: < 1 second
- WebSocket connections: Stable
- Database queries: < 50ms

## 💰 Railway Pricing

### Hobby Plan ($5/month credit)
- ✅ Perfect for this bot
- 512MB RAM
- 1 vCPU
- $5 free credit monthly
- No sleep mode

### Pro Plan ($20/month)
- 8GB RAM
- 8 vCPU
- Horizontal scaling
- Priority support

## 🔗 Useful Commands

```bash
# View all services
railway status

# Open dashboard
railway open

# View logs (live)
railway logs -f

# Run command in production
railway run [command]

# Connect to database
railway connect postgres

# Environment variables
railway variables

# Restart service
railway restart

# Delete deployment
railway down
```

## 🎯 Next Steps

1. **Deploy to Railway**: `railway up`
2. **Configure domains**: Add custom domain in settings
3. **Setup monitoring**: Add Sentry or LogRocket
4. **Configure alerts**: Email/Discord notifications
5. **Test thoroughly**: Use testnet first
6. **Go live**: Switch to mainnet when ready

## ✅ Deployment Verification

After deployment, verify:
- [ ] API Health: `https://api.railway.app/health`
- [ ] Dashboard loads: `https://dashboard.railway.app`
- [ ] WebSocket connects
- [ ] Database migrations complete
- [ ] Redis connection active
- [ ] Webhook endpoint responds
- [ ] Trading engine running

The project is **100% Railway-optimized** and ready for production deployment!