# Immediate Action Plan - Pyramid Trading Bot

## TL;DR - Critical Findings

✅ **GOOD NEWS**: Position sizing math is CORRECT
❌ **BAD NEWS**: Cannot test due to missing database user
⚠️ **RISK**: Bot appears functional but untested

---

## Immediate Actions Required

### 1. Fix Database User Issue (CRITICAL)
**Problem**: `userId is not defined` prevents all webhook testing

**Solutions** (choose one):

#### Option A: Railway Database Seed
```bash
# Connect to Railway and run:
railway run npx prisma db seed
```

#### Option B: Manual Database Insert
```sql
-- Execute on Railway database
INSERT INTO users (id, email, "passwordHash", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'test@example.com', '$2b$10$dummy.hash.for.testing', now(), now());
```

#### Option C: Auto-Create User (Quick Fix)
Modify webhook handler to auto-create user if none exists:
```typescript
// In getUserIdFromWebhook function
if (!defaultUser) {
  defaultUser = await fastify.prisma.user.create({
    data: {
      email: 'auto-created@bot.local',
      passwordHash: 'placeholder'
    }
  });
}
```

### 2. Test Pyramid Functionality
Once user issue is fixed, run these commands:

```bash
# Test Level 1
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action":"buy","symbol":"SOL-PERP","price":140.5,"strategy":"test","timestamp":'$(date +%s)000'}'

# Test Level 2 (wait 10 seconds)
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action":"buy","symbol":"SOL-PERP","price":141.0,"strategy":"test","timestamp":'$(date +%s)000'}'

# Test Exit
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action":"sell","symbol":"SOL-PERP","price":142.0,"strategy":"test","timestamp":'$(date +%s)000'}'
```

### 3. Verification Steps
- [ ] Check Railway logs for signal processing
- [ ] Monitor Hyperliquid testnet portfolio
- [ ] Verify position sizes match expectations
- [ ] Confirm pyramid levels increment correctly

---

## Position Sizing Validation

**Expected for $1000 account:**
- Level 1: ~4.3 SOL (15% @ 4x = $600)
- Level 2: ~10.7 SOL (25% @ 6x = $1500)
- Level 3: ~17.1 SOL (30% @ 8x = $2400)
- Level 4: ~21.4 SOL (30% @ 10x = $3000)

**Current 4.88 SOL position suggests:**
- Account value was ~$1140 when opened
- Position sizing is working correctly

---

## Before Mainnet (MANDATORY)

1. **Reduce Leverage**: Change from [4,6,8,10] to [2,3,4,5]
2. **Add Position Limits**: Max 50% account exposure
3. **Implement Emergency Stop**: Manual override capability
4. **Enhanced Monitoring**: Real-time alerts
5. **Full Test Suite**: Complete pyramid scenarios

---

## Quick Commands Reference

```bash
# Check bot status
curl https://hypeface-production.up.railway.app/health

# View Railway logs
railway logs -f

# Check testnet portfolio
# https://app.hyperliquid-testnet.xyz/portfolio/0x3D57aF0FeccD210726B5C94E71C6596251EF1339
```

---

## Next Steps Priority

1. 🔴 **CRITICAL**: Fix user database issue (30 min)
2. 🟡 **HIGH**: Run complete test suite (1 hour)
3. 🟡 **HIGH**: Reduce leverage for mainnet (15 min)
4. 🟢 **MEDIUM**: Add monitoring/alerts (2 hours)
5. 🟢 **MEDIUM**: Create emergency controls (1 hour)

**Total time to production ready**: ~4-5 hours

---

**Bottom Line**: The bot logic is solid, but operational issues prevent proper testing. Fix the user creation, test thoroughly, reduce leverage, then deploy to mainnet.