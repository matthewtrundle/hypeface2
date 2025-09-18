#!/bin/bash

echo "================================================="
echo "TESTING NEW RAILWAY SERVICE - SHIMMERING BEAUTY"
echo "================================================="
echo ""

# Wait for deployment
echo "Waiting 90 seconds for deployment to complete..."
sleep 90

# Check version endpoint
echo ""
echo "1. Checking /version endpoint..."
curl -s https://shimmering-beauty-production.up.railway.app/version | python3 -m json.tool
echo ""

# Test webhook endpoint
echo "2. Testing webhook health..."
curl -X GET https://shimmering-beauty-production.up.railway.app/webhooks/health -w "\nHTTP Status: %{http_code}\n"
echo ""

# Test sell signals
echo "3. Testing SELL signals..."
echo ""
echo "Sending FIRST sell signal (should sell 50% = 0.425 SOL)..."
curl -X POST "https://shimmering-beauty-production.up.railway.app/webhooks/tradingview?secret=5b2eb1eaaa5899e9d73eda230e83dea4d1e7d464dcf5854217d4a241fd1b935e" \
  -H "Content-Type: application/json" \
  -d '{"action": "sell", "symbol": "SOL-PERP", "price": 240.00, "strategy": "pyramid"}' 2>&1

echo ""
echo ""
echo "Waiting 5 seconds..."
sleep 5

echo "Sending SECOND sell signal (should close remaining 0.425 SOL)..."
curl -X POST "https://shimmering-beauty-production.up.railway.app/webhooks/tradingview?secret=5b2eb1eaaa5899e9d73eda230e83dea4d1e7d464dcf5854217d4a241fd1b935e" \
  -H "Content-Type: application/json" \
  -d '{"action": "sell", "symbol": "SOL-PERP", "price": 240.00, "strategy": "pyramid"}' 2>&1

echo ""
echo ""
echo "================================================="
echo "TEST COMPLETE"
echo "Check position at: https://app.hyperliquid.xyz/portfolio"
echo "================================================="