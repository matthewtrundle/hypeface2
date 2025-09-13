# 🌍 Regional Deployment Guide - Hyperliquid Trading Restrictions

## ⚠️ IMPORTANT: Geographic Restrictions

Hyperliquid has **geographic restrictions** that block access from certain regions, including:

### 🚫 Restricted Regions:
- **United States** (including all US territories)
- **Canada** (Ontario specifically)
- **Sanctioned countries** (North Korea, Iran, Syria, etc.)
- Some other jurisdictions with strict crypto regulations

### ✅ Allowed Regions for Deployment:
- **Europe** (Netherlands, Germany, France)
- **Asia** (Singapore, Japan, South Korea)
- **UK** (London)
- **Australia** (Sydney)

---

## 🚀 Railway Regional Deployment

### Recommended Deployment Regions:

#### 1. **Europe - Amsterdam (Recommended)**
```toml
# railway.toml
[deploy]
region = "eu-west1"  # Amsterdam
```
**Why Amsterdam?**
- Low latency to major exchanges
- Crypto-friendly jurisdiction
- Excellent connectivity
- No Hyperliquid restrictions

#### 2. **Asia - Singapore**
```toml
# railway.toml
[deploy]
region = "ap-southeast1"  # Singapore
```
**Why Singapore?**
- Closest to many crypto exchanges
- Very crypto-friendly
- Excellent infrastructure
- No restrictions

#### 3. **UK - London**
```toml
# railway.toml
[deploy]
region = "eu-west2"  # London
```
**Why London?**
- Good for European trading hours
- Strong infrastructure
- No current restrictions

### How to Set Region in Railway:

```bash
# Method 1: Update railway.toml
[deploy]
region = "eu-west1"  # Change this to desired region

# Method 2: Set via CLI during deployment
railway up --region eu-west1

# Method 3: Set in Railway Dashboard
# Project Settings → Deployment → Region
```

---

## 🔐 Wallet Setup Security - How It Works

### The Wallet Generation Process

I created a **secure wallet generation system** in `scripts/create-test-wallet.js`:

#### 1. **Random Wallet Generation**
```javascript
const { Wallet } = require('ethers');
const wallet = Wallet.createRandom();
```
- Uses cryptographically secure random number generation
- Creates a new Ethereum/EVM-compatible wallet
- Generates private key, public key, and mnemonic phrase

#### 2. **Private Key Encryption**
```javascript
const masterKey = crypto.randomBytes(32).toString('hex');
const encryptedPrivateKey = CryptoJS.AES.encrypt(
  wallet.privateKey,
  masterKey
).toString();
```
- **NEVER** stores private keys in plain text
- Uses AES-256 encryption
- Master key required to decrypt
- Even if database is compromised, keys are encrypted

#### 3. **Multi-Layer Security**
```
Raw Private Key
    ↓
AES-256 Encryption (with Master Key)
    ↓
Encrypted Private Key (stored in database)
    ↓
Environment Variable (MASTER_ENCRYPTION_KEY)
    ↓
Decryption only when needed for trading
```

#### 4. **What Gets Stored Where:**

| Component | Storage Location | Security Level |
|-----------|-----------------|----------------|
| **Private Key (Raw)** | NEVER STORED | ❌ Never saved |
| **Private Key (Encrypted)** | Database | 🔐 AES-256 encrypted |
| **Master Encryption Key** | Environment Variable | 🔑 Railway secrets |
| **Public Address** | Database | ✅ Safe to store |
| **Mnemonic Phrase** | Shown once, user backup | 📝 User responsibility |

---

## 🛡️ Security Best Practices

### For Regional Deployment:
1. **Use VPN endpoints** in allowed regions if needed
2. **Deploy to EU/Asia** for best compatibility
3. **Monitor IP restrictions** in logs
4. **Use regional CDNs** for frontend

### For Wallet Security:
1. **Production Wallet Setup:**
```bash
# 1. Generate NEW wallet for production
node scripts/create-test-wallet.js

# 2. Save mnemonic phrase OFFLINE
# Write it down, store securely

# 3. Fund with small amount first
# Test with $10-50 before larger amounts

# 4. Rotate encryption keys periodically
# Change MASTER_ENCRYPTION_KEY monthly
```

2. **Environment Variable Security:**
```env
# NEVER commit these to git
MASTER_ENCRYPTION_KEY=<32+ character key>
WALLET_PRIVATE_KEY=<encrypted string>

# Railway stores these encrypted
# Only accessible to your app at runtime
```

3. **Access Control:**
- Private keys only decrypted in memory
- Never logged or exposed in API responses
- Automatic cleanup after use
- Rate limiting on wallet operations

---

## 🌐 Complete Regional Setup for Railway

### Step 1: Choose Region
```bash
# Check available regions
railway regions

# Recommended for Hyperliquid
eu-west1    # Amsterdam ✅
eu-west2    # London ✅
ap-southeast1 # Singapore ✅
```

### Step 2: Update Configuration
```toml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
region = "eu-west1"  # Amsterdam recommended
startCommand = "npm run start:prod"
```

### Step 3: Deploy to Specific Region
```bash
# Deploy with region flag
railway up --region eu-west1

# Verify deployment region
railway status
```

### Step 4: Test Access
```bash
# Test from deployed region
railway run curl https://api.hyperliquid.xyz/info

# Should return API response, not blocked
```

---

## 🔍 How to Verify Your Deployment Region

### Check Current Region:
```bash
# Via CLI
railway status

# Via Dashboard
# Railway Dashboard → Project → Settings → Region

# Via API test
railway run curl http://ip-api.com/json
```

### Test Hyperliquid Access:
```javascript
// Test script to verify access
const testAccess = async () => {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' })
    });

    if (response.ok) {
      console.log('✅ Hyperliquid accessible from this region');
    } else {
      console.log('❌ Hyperliquid blocked in this region');
    }
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
  }
};
```

---

## 📊 Latency Considerations

### Best Regions by Latency:

| Region | Location | Latency to Hyperliquid | Best For |
|--------|----------|----------------------|----------|
| **eu-west1** | Amsterdam | ~10-20ms | European trading |
| **ap-southeast1** | Singapore | ~5-15ms | Asian markets |
| **eu-west2** | London | ~15-25ms | UK/EU trading |
| **ap-northeast1** | Tokyo | ~10-20ms | Japan/Korea |

### Optimize for Your Trading:
- **High-frequency**: Deploy to Singapore
- **European hours**: Deploy to Amsterdam
- **24/7 operation**: Amsterdam (good global connectivity)

---

## 🚨 Important Legal Notes

1. **Compliance**: Ensure you comply with your local regulations
2. **VPN Usage**: Using VPNs to bypass restrictions may violate ToS
3. **Tax Obligations**: Report trading activity according to your jurisdiction
4. **Risk Disclosure**: Crypto trading carries significant risks

---

## ✅ Regional Deployment Checklist

- [ ] Choose deployment region (eu-west1 recommended)
- [ ] Update railway.toml with region
- [ ] Deploy to selected region
- [ ] Test Hyperliquid API access
- [ ] Verify latency is acceptable
- [ ] Monitor for any access issues
- [ ] Set up monitoring alerts
- [ ] Document region choice

---

## 🔑 Wallet Security Checklist

- [ ] Generate new wallet for production
- [ ] Save mnemonic phrase offline
- [ ] Encrypt private key before storage
- [ ] Store master key in environment variables
- [ ] Never log private keys
- [ ] Test with small amounts first
- [ ] Set up wallet monitoring
- [ ] Plan key rotation schedule

Your bot is now configured for **secure, regionally-compliant deployment!** 🚀