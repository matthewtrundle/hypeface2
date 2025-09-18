#!/bin/bash

# Railway Deployment Script with Version Tracking
# This script ensures Railway uses the latest code and not cached versions

set -e  # Exit on error

echo "🚀 Starting Railway deployment with version tracking..."

# Generate build version based on timestamp and git commit
export BUILD_VERSION=$(date +%Y%m%d-%H%M%S)
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export COMMIT_SHA=$(git rev-parse HEAD || echo "unknown")
export COMMIT_SHORT=$(git rev-parse --short HEAD || echo "unknown")

echo "📦 Build Information:"
echo "  - Version: $BUILD_VERSION"
echo "  - Commit: $COMMIT_SHORT"
echo "  - Time: $BUILD_TIME"

# Create version file
cat > version.json << EOF
{
  "version": "$BUILD_VERSION",
  "buildTime": "$BUILD_TIME",
  "commitSha": "$COMMIT_SHA",
  "commitShort": "$COMMIT_SHORT",
  "deploymentTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "✅ Version file created"

# Clear any local build artifacts
echo "🧹 Cleaning build artifacts..."
rm -rf dist/
rm -rf node_modules/.cache/
rm -rf .next/
rm -rf tsconfig.tsbuildinfo

# Update package.json version (optional)
if command -v jq &> /dev/null; then
  jq ".version = \"1.0.0-$BUILD_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
  echo "✅ Updated package.json version"
fi

# Set Railway environment variables
echo "🔧 Setting Railway environment variables..."
railway variables set BUILD_VERSION="$BUILD_VERSION"
railway variables set BUILD_TIME="$BUILD_TIME"
railway variables set COMMIT_SHA="$COMMIT_SHA"

# Force Railway to rebuild by updating a timestamp file
echo "$BUILD_VERSION" > .railway-deploy-version
git add .railway-deploy-version version.json
git commit -m "Deploy: Version $BUILD_VERSION [skip ci]" || true

# Push changes
echo "📤 Pushing to repository..."
git push origin main

# Trigger Railway deployment
echo "🚂 Triggering Railway deployment..."
railway up --detach

# Wait for deployment to start
echo "⏳ Waiting for deployment to start..."
sleep 5

# Get deployment status
echo "📊 Checking deployment status..."
railway status

# Monitor deployment logs
echo "📝 Monitoring deployment logs (press Ctrl+C to exit)..."
railway logs -f

echo "✅ Deployment script completed!"
echo ""
echo "🔍 Verify deployment:"
echo "  1. Check health: curl https://your-app.railway.app/health"
echo "  2. Check version: curl https://your-app.railway.app/version"
echo "  3. Monitor logs: railway logs -f"