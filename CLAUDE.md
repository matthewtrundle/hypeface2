# CLAUDE.md - Hyperliquid Trading Bot Project Context

## 🚀 Project Overview

This is an automated trading bot for Hyperliquid DEX that executes trades based on TradingView webhook signals. The bot manages long/short positions with leverage, provides a real-time dashboard, and is designed for deployment on Railway.

**IMPORTANT**: This bot handles real money. Use testnet for development and testing. Never commit private keys or sensitive data.

## 🎯 Core Functionality

1. **Signal Processing**: Receives buy/sell signals from TradingView webhooks
   - Buy signal → Open long position (if no position exists)
   - Sell signal → Close long position (if exists)
   - **LONG ONLY STRATEGY** - No short positions

2. **Position Management**: Automated long position tracking with P&L calculations
3. **Dashboard**: Real-time web interface for monitoring
4. **Security**: Encrypted wallet management, secure webhooks

## 🏗️ Architecture

- **Backend**: TypeScript/Node.js with Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Frontend**: Next.js 14 with Tailwind CSS
- **Real-time**: Socket.io for WebSocket updates
- **Deployment**: Railway (production) / Docker Compose (local)

## 📁 Project Structure

```
hyperliquid-trading-bot/
├── apps/
│   ├── api/          # Backend trading engine
│   └── dashboard/    # Next.js frontend
├── packages/         # Shared code
├── ARCHITECTURE.md   # System design documentation
├── IMPLEMENTATION_GUIDE.md # Step-by-step implementation
└── CLAUDE.md        # This file
```

## 🔑 Environment Variables

**CRITICAL**: The following environment variables must be set:

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/db"
REDIS_URL="redis://localhost:6379"

# Security (NEVER COMMIT THESE)
JWT_SECRET="[generate-secure-random-string]"
MASTER_ENCRYPTION_KEY="[32-character-key]"
WEBHOOK_SECRET="[webhook-verification-secret]"
WALLET_PRIVATE_KEY="[encrypted-private-key]"

# Hyperliquid
HYPERLIQUID_API_URL="https://api.hyperliquid-testnet.xyz"  # Use testnet first!

# Application
PORT=3001
FRONTEND_URL="http://localhost:3000"
```

## 🛠️ Development Commands

### Initial Setup
```bash
# Install dependencies
npm install

# Setup database (requires Docker)
docker-compose up -d postgres redis
cd apps/api
npm run db:migrate
npm run db:generate

# Create placeholder wallet (for development)
node scripts/create-test-wallet.js
```

### Running the Application
```bash
# Start backend (Terminal 1)
cd apps/api
npm run dev

# Start frontend (Terminal 2)
cd apps/dashboard
npm run dev

# Run tests
npm run test

# Lint and typecheck (ALWAYS RUN BEFORE COMMITTING)
npm run lint
npm run typecheck
```

### Deployment
```bash
# Deploy to Railway
railway login
railway link
railway up

# View logs
railway logs

# Access Railway shell
railway run bash
```

## 🔐 Security Considerations

1. **Private Keys**:
   - NEVER commit private keys to git
   - Always use encrypted storage
   - Use separate keys for testnet/mainnet
   - Create new wallet before transferring real funds

2. **Webhook Security**:
   - Verify HMAC signatures on all webhooks
   - Implement rate limiting
   - Use timestamp validation

3. **API Security**:
   - JWT authentication required
   - HTTPS only in production
   - Input validation on all endpoints

## 📊 Trading Logic

### Position Management Rules
1. Only one position per symbol at a time
2. Position size: 10% of available balance (configurable)
3. Market orders only (no limit orders currently)
4. Automatic P&L tracking

### Signal Processing (Long Only)
```typescript
// Buy Signal Logic
if (!currentPosition) {
  openLongPosition();
}

// Sell Signal Logic
if (currentPosition === 'long') {
  closeLongPosition();
}
// No short position opened
```

## 🧪 Testing

### Mock Webhook Testing
```bash
# Send test buy signal
curl -X POST http://localhost:3001/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: [signature]" \
  -d '{"action": "buy", "symbol": "BTC-USD"}'

# Send test sell signal
curl -X POST http://localhost:3001/webhooks/tradingview \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: [signature]" \
  -d '{"action": "sell", "symbol": "BTC-USD"}'
```

### Using Testnet
1. Get testnet funds: https://app.hyperliquid-testnet.xyz/drip
2. Generate testnet API keys
3. Set `HYPERLIQUID_API_URL` to testnet endpoint
4. Test thoroughly before mainnet deployment

## 🚨 Important Warnings

1. **NEVER expose private keys or seed phrases**
2. **ALWAYS test on testnet first**
3. **NEVER skip webhook signature verification**
4. **ALWAYS run lint/typecheck before deploying**
5. **NEVER use real funds until fully tested**

## 📈 Monitoring & Logs

### Health Check
```bash
curl http://localhost:3001/health
```

### View Logs
```bash
# Local
docker-compose logs -f api

# Production (Railway)
railway logs
```

### Database Access
```bash
# Local Prisma Studio
cd apps/api
npm run db:studio

# Production database
railway run npx prisma studio
```

## 🔄 Continuous Tasks

When working on this project, always:
1. Check existing code patterns before implementing new features
2. Run tests after making changes
3. Update this CLAUDE.md file with new important information
4. Use the todo list to track progress
5. Commit with meaningful messages

## 🎮 YOLO Mode Configuration

To enable autonomous operation:
1. Ensure all tests are passing
2. Environment variables are properly set
3. Wallet has sufficient funds for trading
4. Monitoring is configured
5. Error notifications are set up

**YOLO Mode Commands**:
```bash
# Before running any significant changes
npm run lint && npm run typecheck && npm run test

# Deploy with confidence
npm run deploy:production
```

## 📝 Current Status

- [x] Architecture designed
- [x] Implementation guide created
- [ ] Project structure initialized
- [ ] Database schema implemented
- [ ] Trading engine built
- [ ] Dashboard created
- [ ] Webhook receiver implemented
- [ ] Deployment configured
- [ ] Testing complete

## 🤝 MCP Server Integration

Potential MCP servers to integrate:
- Database server for PostgreSQL operations
- Filesystem server for file management
- GitHub server for version control
- Monitoring server for system health

## 📚 References

- [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/)
- [Official Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk)
- [TypeScript SDK](https://www.npmjs.com/package/@nktkas/hyperliquid)
- [Railway Docs](https://docs.railway.app/)
- [TradingView Webhooks](https://www.tradingview.com/support/solutions/43000529348-webhooks/)

## 🎯 Next Immediate Steps

1. Initialize project structure with TypeScript
2. Set up PostgreSQL database with Prisma
3. Implement basic wallet management
4. Create webhook receiver endpoint
5. Build trading engine core
6. Develop dashboard UI
7. Configure Railway deployment
8. Test with mock webhooks
9. Deploy to testnet
10. Thorough testing before mainnet

---

**Remember**: This bot handles real money. Security, testing, and careful implementation are paramount. When in doubt, test more!