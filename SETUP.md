# Hyperliquid Trading Bot - Setup Guide

## Prerequisites

- Node.js 20+ (Node 24+ recommended for @nktkas/hyperliquid package)
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Redis (via Docker)
- A Hyperliquid account with API access

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd hyperliquid-trading-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database credentials
- JWT secret (generate a secure random string)
- Master encryption key (32+ characters)
- Webhook secret (for TradingView)

### 4. Start Databases

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis in Docker containers.

### 5. Generate Test Wallet

```bash
node scripts/create-test-wallet.js
```

Copy the generated keys to your `.env` file:
- `WALLET_PUBLIC_KEY`
- `WALLET_PRIVATE_KEY` (encrypted)
- `MASTER_ENCRYPTION_KEY`

**⚠️ IMPORTANT**: This is for testing only! Generate a new wallet for production.

### 6. Setup Database

```bash
cd apps/api
npm run db:migrate
npm run db:generate
npm run db:seed  # Creates test user
```

### 7. Start Development Servers

Terminal 1 - API:
```bash
npm run dev:api
```

Terminal 2 - Dashboard:
```bash
npm run dev:dashboard
```

### 8. Access the Application

- Dashboard: http://localhost:3000
- API: http://localhost:3001
- API Health: http://localhost:3001/health

### 9. Test Login Credentials

```
Email: test@example.com
Password: testpassword
```

## Testing

### Test API Endpoints

```bash
node scripts/test-api.js
```

### Send Test Webhook

```bash
chmod +x scripts/test-webhook.sh
./scripts/test-webhook.sh buy BTC-USD
./scripts/test-webhook.sh sell ETH-USD
```

## Production Deployment

### Railway Deployment

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Create new project:
```bash
railway init
```

4. Add environment variables in Railway dashboard

5. Deploy:
```bash
railway up
```

### Environment Variables for Production

```bash
# Database (Railway provides)
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# Security (generate new ones!)
JWT_SECRET="<generate-secure-random-string>"
MASTER_ENCRYPTION_KEY="<32-character-minimum>"
WEBHOOK_SECRET="<from-tradingview>"

# Hyperliquid
HYPERLIQUID_API_URL="https://api.hyperliquid.xyz"  # Mainnet
WALLET_PRIVATE_KEY="<encrypted-private-key>"

# Application
NODE_ENV="production"
FRONTEND_URL="https://your-domain.com"
```

## TradingView Webhook Setup

1. Create a new alert in TradingView
2. Set webhook URL: `https://your-api-url/webhooks/tradingview`
3. Configure message format:
```json
{
  "action": "{{strategy.order.action}}",
  "symbol": "{{ticker}}",
  "strategy": "{{strategy.name}}"
}
```
4. Add webhook signature header for security

## Security Checklist

- [ ] Generate new wallet for production
- [ ] Use strong, unique passwords
- [ ] Enable 2FA on Hyperliquid account
- [ ] Secure webhook with signature verification
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS in production
- [ ] Regularly backup database
- [ ] Monitor system logs
- [ ] Set up alerts for errors
- [ ] Test thoroughly on testnet first

## Troubleshooting

### Database Connection Issues
```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs postgres
docker-compose logs redis
```

### API Not Starting
```bash
# Check logs
npm run dev:api

# Verify environment variables
node -e "console.log(process.env.DATABASE_URL)"
```

### Dashboard Build Errors
```bash
# Clear cache and rebuild
rm -rf apps/dashboard/.next
npm run dev:dashboard
```

## Support

For issues, check:
1. Logs in `logs/` directory
2. Docker container logs
3. Railway deployment logs
4. GitHub issues

## Next Steps

1. Configure position sizing and leverage in `.env`
2. Set up monitoring and alerts
3. Test with small amounts on testnet
4. Gradually increase position sizes
5. Monitor performance and adjust parameters