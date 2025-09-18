#!/bin/bash

# Railway Cache Buster Script
# Forces a complete rebuild and clears all caches

echo "=== RAILWAY CACHE BUSTER ==="
echo ""

# 1. Clear all build caches
echo "Clearing build caches..."
rm -rf node_modules/.cache
rm -rf dist
rm -rf build
rm -rf .turbo
rm -rf tsconfig.tsbuildinfo

# 2. Force reinstall dependencies
echo "Removing node_modules..."
rm -rf node_modules
rm -f package-lock.json

# 3. Clean install
echo "Clean installing dependencies..."
npm ci

# 4. Rebuild TypeScript
echo "Rebuilding TypeScript..."
npm run build

echo ""
echo "Cache cleared! Now deploy with:"
echo "railway up --force"