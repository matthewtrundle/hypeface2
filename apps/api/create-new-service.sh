#!/bin/bash

echo "================================================="
echo "Creating New Railway Service to Fix Caching"
echo "================================================="
echo ""

# Step 1: Create new service
echo "Step 1: Creating new service..."
railway service create hypeface-api-v2

echo ""
echo "Step 2: Linking to new service..."
railway link hypeface-api-v2

echo ""
echo "Step 3: Copying environment variables from old service..."
echo "Note: You'll need to manually copy DATABASE_URL and REDIS_URL"
echo "from the old service to connect to existing databases"
echo ""
echo "Run these commands to copy variables:"
echo "1. railway link hypeface-api  # Link to old service"
echo "2. railway variables --json > old-vars.json"
echo "3. railway link hypeface-api-v2  # Link to new service"
echo "4. railway variables set DATABASE_URL=\"[copy from old]\" REDIS_URL=\"[copy from old]\""
echo ""
echo "Or use Railway dashboard to copy all variables"

echo ""
echo "Step 4: Once variables are copied, deploy fresh code:"
echo "railway up"

echo ""
echo "Step 5: Update webhook URL if domain changes"
echo ""
echo "================================================="
echo "After deployment, test with:"
echo "./test-webhooks.sh"
echo "================================================="