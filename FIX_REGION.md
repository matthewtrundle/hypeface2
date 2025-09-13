# 🚨 CRITICAL: Fix Railway Region (Currently US - BLOCKED!)

Your deployment is going to **US-EAST4** which is **BLOCKED by Hyperliquid**!

## Option 1: Fix via Railway Dashboard (Easiest)

1. Go to: https://railway.app/project/2ae27658-8d72-4672-b11d-40587896f041
2. Click on **Settings** (gear icon)
3. Find **Region** setting
4. Change from `US East` to `Europe West` or `Europe Central`
5. Save changes
6. Deploy again: `railway up`

## Option 2: Create New Project with Correct Region

```bash
# 1. Unlink current project
railway unlink

# 2. Create new project (you'll be prompted for region)
railway init

# 3. When prompted, choose:
#    - Project name: hyperliquid-bot-eu
#    - Region: Europe West (Amsterdam) or Europe Central

# 4. Deploy
railway up
```

## Option 3: Use Railway Dashboard to Create Service

1. Go to Railway Dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repo: `hype`
5. **IMPORTANT**: Select Region as `Europe West`
6. Add all environment variables
7. Deploy

## Required Environment Variables

Add these in Railway dashboard:

```env
# From your existing vars (keep these):
HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz
JWT_SECRET=[your existing value]
MASTER_ENCRYPTION_KEY=JZ+vRwo0Gzs/vzjyq7eNm/yuJNOJnWfIMWwYeLADna8=
WEBHOOK_SECRET=[your existing value]
POSITION_SIZE_PERCENTAGE=10
MAX_LEVERAGE=5
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Add these NEW wallet variables:
WALLET_PUBLIC_KEY=0x9E36F6d8DB7cAa1F1bbFb65689f20844cf1712E8
WALLET_PRIVATE_KEY=U2FsdGVkX18XNu5di/hYMyIcX+0U7nZGY67j6IF2P3Fjfo3rFl/KlkfGch5mtaOXJEbU4Q0U0PQz5/cOOkEyViKLSTpODgIksUdqKUiddMY+NmQjr+krANWhcDWPcymk
```

## Why This Matters

- **US regions are BLOCKED** by Hyperliquid
- Your bot will fail with "403 Forbidden" errors from US IPs
- Must deploy to Europe, Asia, or other allowed regions

## After Fixing Region

```bash
# Deploy
railway up

# Check it's in correct region
railway status

# Should show Region: europe-west or similar
```