#!/bin/bash

# Hyperliquid Trading Bot - Railway Deployment Script
# This script will guide you through deploying to Railway

set -e  # Exit on error

echo "================================================"
echo "🚀 Hyperliquid Trading Bot - Railway Deployment"
echo "================================================"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Railway CLI not found. Installing..."
    echo ""
    echo "Choose your installation method:"
    echo "1) npm (recommended)"
    echo "2) brew (macOS)"
    echo "3) curl"

    read -p "Enter choice (1-3): " choice

    case $choice in
        1)
            echo "Installing via npm..."
            npm install -g @railway/cli
            ;;
        2)
            echo "Installing via brew..."
            brew install railway
            ;;
        3)
            echo "Installing via curl..."
            curl -fsSL https://railway.app/install.sh | sh
            ;;
        *)
            echo "Invalid choice. Please install manually:"
            echo "npm install -g @railway/cli"
            exit 1
            ;;
    esac

    echo "✅ Railway CLI installed successfully!"
    echo ""
fi

# Login to Railway
echo "🔐 Step 1: Login to Railway"
echo "----------------------------"
echo "This will open your browser to authenticate."
read -p "Press Enter to login to Railway..."
railway login

echo ""
echo "✅ Logged in to Railway!"
echo ""

# Initialize Railway project
echo "📋 Step 2: Initialize Railway Project"
echo "-------------------------------------"
echo "Creating a new Railway project for your trading bot..."
echo ""

# Check if already linked
if [ -f ".railway/config.json" ]; then
    echo "⚠️  Project already linked to Railway."
    read -p "Do you want to create a new project? (y/n): " create_new
    if [ "$create_new" != "y" ]; then
        echo "Using existing project."
    else
        railway init
    fi
else
    railway init
fi

echo ""
echo "✅ Railway project initialized!"
echo ""

# Create services
echo "🗄️ Step 3: Setting up Database Services"
echo "---------------------------------------"
echo "Railway will automatically provision PostgreSQL and Redis."
echo ""
echo "To add services, go to your Railway dashboard after deployment."
echo "Dashboard URL will be provided at the end."
echo ""

# Generate secure keys
echo "🔐 Step 4: Generating Security Keys"
echo "-----------------------------------"
echo ""

# Generate JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
echo "✅ JWT_SECRET generated: $JWT_SECRET"

# Generate Master Encryption Key
MASTER_KEY=$(openssl rand -base64 32)
echo "✅ MASTER_ENCRYPTION_KEY generated: $MASTER_KEY"

# Generate Webhook Secret
WEBHOOK_SECRET=$(openssl rand -hex 20)
echo "✅ WEBHOOK_SECRET generated: $WEBHOOK_SECRET"

echo ""
echo "📝 Save these keys securely! You'll need them for environment variables."
echo ""

# Create test wallet
echo "💳 Step 5: Creating Test Wallet"
echo "-------------------------------"
read -p "Do you want to generate a test wallet now? (y/n): " gen_wallet

if [ "$gen_wallet" == "y" ]; then
    echo ""
    echo "Generating test wallet..."
    MASTER_ENCRYPTION_KEY=$MASTER_KEY node scripts/create-test-wallet.js
    echo ""
    echo "⚠️  IMPORTANT: Save the mnemonic phrase securely!"
    echo ""
fi

# Set environment variables
echo "🔧 Step 6: Environment Variables"
echo "--------------------------------"
echo ""
echo "You need to set these in Railway dashboard:"
echo ""
echo "1. Go to: https://railway.app/dashboard"
echo "2. Select your project"
echo "3. Go to 'Variables' tab"
echo "4. Add these variables:"
echo ""
echo "=== COPY THESE TO RAILWAY ==="
echo ""
echo "# Security"
echo "JWT_SECRET=$JWT_SECRET"
echo "MASTER_ENCRYPTION_KEY=$MASTER_KEY"
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"
echo ""
echo "# Hyperliquid (Testnet first!)"
echo "HYPERLIQUID_API_URL=https://api.hyperliquid-testnet.xyz"
echo ""
echo "# Trading Config"
echo "POSITION_SIZE_PERCENTAGE=10"
echo "MAX_LEVERAGE=5"
echo ""
echo "# Application"
echo "NODE_ENV=production"
echo "PORT=3001"
echo "LOG_LEVEL=info"
echo ""
echo "=============================="
echo ""
read -p "Press Enter after you've added the variables to Railway..."

# Deploy
echo ""
echo "🚀 Step 7: Deploying to Railway"
echo "-------------------------------"
echo "Starting deployment to Amsterdam (EU) region..."
echo ""

railway up --region eu-west1

echo ""
echo "✅ Deployment initiated!"
echo ""

# Get deployment URL
echo "🌐 Step 8: Getting Deployment URL"
echo "---------------------------------"
railway status

echo ""
echo "📋 Step 9: Post-Deployment Setup"
echo "--------------------------------"
echo ""
echo "Run these commands after deployment completes:"
echo ""
echo "# 1. Run database migrations:"
echo "railway run npm run db:migrate"
echo ""
echo "# 2. Seed test user:"
echo "railway run npm run db:seed"
echo ""
echo "# 3. Check health endpoint:"
echo "railway run curl \$(railway variables get RAILWAY_STATIC_URL)/health"
echo ""
echo "# 4. View logs:"
echo "railway logs -f"
echo ""

# Open dashboard
echo "🎉 Step 10: Open Railway Dashboard"
echo "----------------------------------"
read -p "Do you want to open the Railway dashboard now? (y/n): " open_dash

if [ "$open_dash" == "y" ]; then
    railway open
fi

echo ""
echo "================================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "================================================"
echo ""
echo "Next Steps:"
echo "1. Add PostgreSQL and Redis in Railway dashboard"
echo "2. Set remaining environment variables"
echo "3. Run database migrations (commands above)"
echo "4. Test with mock webhooks"
echo "5. Configure TradingView webhooks"
echo ""
echo "Important URLs:"
echo "- Railway Dashboard: https://railway.app/dashboard"
echo "- Your App: Check 'railway status' output"
echo "- Health Check: [your-app-url]/health"
echo ""
echo "Support Commands:"
echo "- View logs: railway logs -f"
echo "- SSH into container: railway run bash"
echo "- Run commands: railway run [command]"
echo ""
echo "🚀 Happy Trading!"