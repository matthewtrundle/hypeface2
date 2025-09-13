# Hyperliquid Trading Bot

An automated trading bot for Hyperliquid DEX that executes trades based on TradingView webhook signals.

## Features

- 📊 Automated trading based on TradingView signals
- 📈 Long/short position management with leverage
- 💰 Real-time P&L tracking
- 🎯 Web dashboard for monitoring
- 🔐 Secure wallet management
- 🚀 Production-ready deployment

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Redis (via Docker)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd hyperliquid-trading-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start local databases:
```bash
docker-compose up -d
```

5. Generate a test wallet:
```bash
node scripts/create-test-wallet.js
```

6. Setup database:
```bash
cd apps/api
npm run db:migrate
npm run db:generate
```

7. Start development servers:
```bash
# Terminal 1 - API
npm run dev:api

# Terminal 2 - Dashboard
npm run dev:dashboard
```

## Project Structure

```
├── apps/
│   ├── api/          # Backend trading engine
│   └── dashboard/    # Next.js frontend
├── packages/         # Shared packages
├── scripts/          # Utility scripts
├── ARCHITECTURE.md   # System design
├── CLAUDE.md        # AI context
└── README.md        # This file
```

## Trading Logic (Long Only)

- **Buy Signal**: Open long position (if no position exists)
- **Sell Signal**: Close long position (if exists)
- **No Short Positions**: This bot only trades long positions

## Testing

Use the testnet first:
1. Get test funds: https://app.hyperliquid-testnet.xyz/drip
2. Configure testnet URL in `.env`
3. Test thoroughly before mainnet

## Security

- Never commit private keys
- Use encrypted wallet storage
- Implement webhook signature verification
- Test on testnet first

## Deployment

The bot is configured for Railway deployment:

```bash
railway login
railway link
railway up
```

## License

Private - All rights reserved