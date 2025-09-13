#!/bin/bash

# Test webhook script for Hyperliquid Trading Bot
# Usage: ./test-webhook.sh [buy|sell] [symbol]

ACTION=${1:-buy}
SYMBOL=${2:-BTC-USD}
API_URL=${API_URL:-http://localhost:3001}
WEBHOOK_SECRET=${WEBHOOK_SECRET:-test-secret}

# Generate timestamp
TIMESTAMP=$(date +%s)000

# Create payload
PAYLOAD=$(cat <<EOF
{
  "action": "$ACTION",
  "symbol": "$SYMBOL",
  "strategy": "test-script",
  "timestamp": $TIMESTAMP,
  "metadata": {
    "test": true,
    "source": "test-script"
  }
}
EOF
)

# Generate signature (HMAC-SHA256)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)

echo "Sending test webhook..."
echo "Action: $ACTION"
echo "Symbol: $SYMBOL"
echo "URL: $API_URL/webhooks/test"
echo ""

# Send webhook
RESPONSE=$(curl -X POST "$API_URL/webhooks/test" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD" \
  -s)

echo "Response:"
echo "$RESPONSE" | jq .

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  SIGNAL_ID=$(echo "$RESPONSE" | jq -r '.signalId')
  echo ""
  echo "Signal queued successfully!"
  echo "Signal ID: $SIGNAL_ID"

  # Check signal status
  echo ""
  echo "Checking signal status..."
  sleep 2

  STATUS_RESPONSE=$(curl -X GET "$API_URL/webhooks/status/$SIGNAL_ID" -s)
  echo "$STATUS_RESPONSE" | jq .
else
  echo ""
  echo "Failed to send webhook"
  exit 1
fi