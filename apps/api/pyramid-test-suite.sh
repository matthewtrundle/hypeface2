#!/bin/bash

# Pyramid Trading Bot Test Suite for Testnet
# Run comprehensive tests on the pyramid trading strategy

WEBHOOK_URL="https://hypeface-production.up.railway.app/webhooks/tradingview?secret=${WEBHOOK_SECRET:-your_webhook_secret_here}"
DELAY=10  # Seconds between signals

echo "================================================="
echo "PYRAMID TRADING BOT - COMPREHENSIVE TEST SUITE"
echo "================================================="
echo "Testing on Hyperliquid TESTNET"
echo "Wallet: 0x3D57aF0FeccD210726B5C94E71C6596251EF1339"
echo ""
echo "Expected Pyramid Levels:"
echo "  Level 1: 15% @ 4x leverage"
echo "  Level 2: 25% @ 6x leverage"
echo "  Level 3: 30% @ 8x leverage"
echo "  Level 4: 30% @ 10x leverage"
echo "================================================="
echo ""

# Function to send signal and check status
send_signal() {
    local action=$1
    local test_name=$2
    local price=$3

    echo "[$(date +%H:%M:%S)] Sending $action signal: $test_name"

    # Send the signal
    RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"action\":\"$action\",\"symbol\":\"SOL-PERP\",\"strategy\":\"$test_name\",\"price\":$price}" \
        -s 2>/dev/null)

    # Extract signal ID if successful
    SIGNAL_ID=$(echo $RESPONSE | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('signalId',''))" 2>/dev/null)

    if [ -n "$SIGNAL_ID" ]; then
        echo "  ✅ Signal accepted: $SIGNAL_ID"
        sleep 3

        # Check status
        STATUS=$(curl -s "https://hypeface-production.up.railway.app/webhooks/status/$SIGNAL_ID" 2>/dev/null | python3 -m json.tool 2>/dev/null)
        PROCESSED=$(echo $STATUS | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('processed',False))" 2>/dev/null)

        if [ "$PROCESSED" = "True" ]; then
            echo "  ✅ Signal processed successfully"
        else
            echo "  ⚠️ Signal processing status unknown"
        fi
    else
        echo "  ❌ Signal failed: $RESPONSE"
    fi

    echo ""
}

# Test 1: Open initial position
echo "TEST 1: OPEN INITIAL POSITION (Level 1)"
echo "-----------------------------------------"
send_signal "buy" "pyramid_test_1" 240.00
echo "Check position at: https://app.hyperliquid-testnet.xyz/portfolio/0x3D57aF0FeccD210726B5C94E71C6596251EF1339"
echo "Expected: New position at ~15% of account with 4x leverage"
echo ""
sleep $DELAY

# Test 2: Add to position (Level 2)
echo "TEST 2: PYRAMID UP (Level 2)"
echo "-----------------------------------------"
send_signal "buy" "pyramid_test_2" 241.00
echo "Expected: Position increased by ~25% of account with 6x leverage"
echo ""
sleep $DELAY

# Test 3: Add to position (Level 3)
echo "TEST 3: PYRAMID UP (Level 3)"
echo "-----------------------------------------"
send_signal "buy" "pyramid_test_3" 242.00
echo "Expected: Position increased by ~30% of account with 8x leverage"
echo ""
sleep $DELAY

# Test 4: Add to position (Level 4)
echo "TEST 4: PYRAMID UP (Level 4 - Max)"
echo "-----------------------------------------"
send_signal "buy" "pyramid_test_4" 243.00
echo "Expected: Position increased by ~30% of account with 10x leverage"
echo ""
sleep $DELAY

# Test 5: Try to exceed max levels
echo "TEST 5: EXCEED MAX LEVELS (Should be ignored)"
echo "-----------------------------------------"
send_signal "buy" "pyramid_test_5_excess" 244.00
echo "Expected: No change to position (max levels reached)"
echo ""
sleep $DELAY

# Test 6: Close entire position
echo "TEST 6: CLOSE ENTIRE POSITION"
echo "-----------------------------------------"
send_signal "sell" "pyramid_close_all" 245.00
echo "Expected: Entire position closed"
echo ""

echo "================================================="
echo "TEST SUITE COMPLETE"
echo "================================================="
echo ""
echo "Please verify on Hyperliquid testnet:"
echo "https://app.hyperliquid-testnet.xyz/portfolio/0x3D57aF0FeccD210726B5C94E71C6596251EF1339"
echo ""
echo "Check for:"
echo "1. Correct position sizes at each level"
echo "2. Proper leverage application"
echo "3. Complete closure on SELL signal"
echo "================================================="