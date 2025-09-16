#!/bin/bash

echo "Fetching recent logs from Railway..."
echo "Looking for signal ID: 9ec25146-66b9-4f97-98ee-de439c85032d"
echo "----------------------------------------"

# Use Railway CLI to get logs and filter for our signal
railway logs 2>/dev/null | grep -A 10 -B 2 "9ec25146-66b9-4f97-98ee-de439c85032d" || echo "Signal not found in recent logs"

echo ""
echo "Checking for errors around that time..."
railway logs 2>/dev/null | grep -i "error\|failed\|exception" | tail -10