#!/bin/bash
# Quick testnet testing script

echo "Switching to Hyperliquid testnet..."
railway variables set HYPERLIQUID_API_URL="https://api.hyperliquid-testnet.xyz"

echo "Redeploying..."
railway up

echo "Testnet URL: https://app.hyperliquid-testnet.xyz/drip"
echo "Get test funds from the faucet above"
echo ""
echo "To switch back to mainnet:"
echo "railway variables set HYPERLIQUID_API_URL='https://api.hyperliquid.xyz'"
