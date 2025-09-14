#!/bin/bash

# Script to set pyramid trading environment variables on Railway

echo "Setting pyramid trading environment variables on Railway..."

# Set all pyramid trading variables in one command
railway variables \
  --set "ENABLE_PYRAMIDING=true" \
  --set "PYRAMID_ENTRY_PERCENTAGES=40,30,20,10" \
  --set "PYRAMID_EXIT_PERCENTAGES=40,30,20,10" \
  --set "PYRAMID_LEVERAGE_LEVELS=3,4,5,5" \
  --set "MAX_PYRAMID_LEVELS=4" \
  --set "MAX_TOTAL_EXPOSURE=90" \
  --set "MAX_DRAWDOWN_PERCENTAGE=15" \
  --set "TRAILING_STOP_PERCENTAGE=10" \
  --set "TIME_STOP_HOURS=48" \
  --set "POSITION_SIZE_PERCENTAGE=40" \
  --set "MAX_LEVERAGE=5"

echo "Pyramid trading environment variables set successfully!"
echo "Run 'railway up' to deploy with the new configuration"