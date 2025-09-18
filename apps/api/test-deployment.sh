#!/bin/bash

echo "================================================="
echo "TESTING RAILWAY DEPLOYMENT"
echo "================================================="
echo ""

# Wait for deployment
echo "Waiting 60 seconds for deployment to complete..."
sleep 60

# Check version endpoint
echo ""
echo "1. Checking /version endpoint to verify new deployment..."
curl -s https://hypeface-production.up.railway.app/version | python3 -m json.tool
echo ""

# Test webhook endpoint is alive
echo "2. Testing webhook endpoint..."
curl -X GET https://hypeface-production.up.railway.app/webhooks/health -w "\nHTTP Status: %{http_code}\n"
echo ""

# Now test sell signals
echo "3. Testing SELL signals with new deployment..."
echo ""
echo "Sending FIRST sell signal (should sell 50% of position)..."
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action": "sell", "symbol": "SOL-PERP", "price": 240.00, "strategy": "pyramid"}' 2>&1

echo ""
echo ""
echo "Waiting 5 seconds..."
sleep 5

echo "Sending SECOND sell signal (should close remaining position)..."
curl -X POST "https://hypeface-production.up.railway.app/webhooks/tradingview?secret=3e8e55210be930325825be0b2b204f43f558baec" \
  -H "Content-Type: application/json" \
  -d '{"action": "sell", "symbol": "SOL-PERP", "price": 240.00, "strategy": "pyramid"}' 2>&1

echo ""
echo ""
echo "================================================="
echo "TEST COMPLETE"
echo "Check position at: https://app.hyperliquid.xyz/portfolio"
echo "================================================="