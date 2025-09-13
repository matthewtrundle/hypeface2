# 🚀 DEPLOY NOW - Quick Railway Deployment

## Option 1: Automated Script (Easiest)

I've created a complete deployment script that handles everything:

```bash
# Run the automated deployment script
./deploy-to-railway.sh
```

This script will:
1. ✅ Install Railway CLI if needed
2. ✅ Login to Railway
3. ✅ Create project
4. ✅ Generate security keys
5. ✅ Create test wallet
6. ✅ Deploy to Amsterdam (EU)
7. ✅ Provide all commands needed

---

## Option 2: Manual Steps (If Script Doesn't Work)

### 1️⃣ Install Railway CLI

```bash
# macOS/Linux/Windows (via npm)
npm install -g @railway/cli

# macOS (via Homebrew)
brew install railway

# Or via curl
curl -fsSL https://railway.app/install.sh | sh
```

### 2️⃣ Login & Create Project

```bash
# Login (opens browser)
railway login

# Create new project
railway init

# Choose project name: hyperliquid-trading-bot
```

### 3️⃣ Deploy to Railway (Amsterdam)

```bash
# Deploy to EU (avoids US restrictions)
railway up --region eu-west1
```

### 4️⃣ Add Database Services

Go to Railway Dashboard:
1. Click "New Service" → "Database" → "PostgreSQL"
2. Click "New Service" → "Database" → "Redis"

### 5️⃣ Set Environment Variables

In Railway Dashboard → Variables tab, add:

```env
# === SECURITY (Generate new ones!) ===
JWT_SECRET=K7FqX8JzR9vNmP4sT2wL6hY3aB5eC1gD0iU9oQ7nE8M=
MASTER_ENCRYPTION_KEY=X9mK3pL7nB5vC1zQ8wE6rT4yU2iO0aS9dF7gH5jK3lM=
WEBHOOK_SECRET=a3f7b9e2c5d8a1f4e7b0c3d6a9f2e5b8c1d4e7a0

# === HYPERLIQUID ===
HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz

# === WALLET (Generate with script) ===
WALLET_PUBLIC_KEY=0x... (from create-test-wallet.js)
WALLET_PRIVATE_KEY=encrypted... (from create-test-wallet.js)

# === TRADING ===
POSITION_SIZE_PERCENTAGE=10
MAX_LEVERAGE=5

# === APP ===
NODE_ENV=production
PORT=3001
```

### 6️⃣ Run Database Migrations

```bash
# After deployment completes
railway run npm run db:migrate
railway run npm run db:seed
```

### 7️⃣ Verify Deployment

```bash
# Check status
railway status

# View logs
railway logs -f

# Test health endpoint
railway open
# Navigate to: /health
```

---

## 🆘 Quick Troubleshooting

### If Railway CLI won't install:
```bash
# Try with sudo
sudo npm install -g @railway/cli

# Or use npx instead
npx @railway/cli login
```

### If deployment fails:
```bash
# Check logs
railway logs --build

# Clear and retry
railway up --no-cache
```

### If database won't connect:
```bash
# Check environment variables
railway variables

# DATABASE_URL and REDIS_URL should be auto-set
```

---

## ✅ Success Checklist

- [ ] Railway CLI installed
- [ ] Logged into Railway
- [ ] Project created
- [ ] Deployed to eu-west1 (Amsterdam)
- [ ] PostgreSQL added
- [ ] Redis added
- [ ] Environment variables set
- [ ] Database migrated
- [ ] Health endpoint working
- [ ] Dashboard accessible

---

## 🎯 Your App URLs

After deployment, you'll have:

- **API**: `https://[your-app].railway.app`
- **Health**: `https://[your-app].railway.app/health`
- **Dashboard**: `https://[your-app].railway.app`
- **Webhooks**: `https://[your-app].railway.app/webhooks/tradingview`

---

## 📞 Need Help?

1. **Railway Docs**: https://docs.railway.app
2. **Railway Discord**: https://discord.gg/railway
3. **Check Logs**: `railway logs -f`
4. **Dashboard**: `railway open`

---

## 🏃 DEPLOY RIGHT NOW!

```bash
# Just run this:
./deploy-to-railway.sh

# That's it! Follow the prompts and you're live in 5 minutes!
```