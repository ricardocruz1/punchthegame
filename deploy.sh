#!/bin/bash
# Auto-deploy with cache busting
# Usage: ./deploy.sh "commit message"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"commit message\""
  exit 1
fi

# Generate a unique version string (unix timestamp)
VERSION=$(date +%s)

# Update the cache-busting version in index.html
sed -i '' "s|game\.js?v=[^\"]*|game.js?v=$VERSION|g" index.html

echo "Cache bust: game.js?v=$VERSION"

# Stage, commit, push
git add -A
git commit -m "$1"
git push origin main

echo ""
echo "Deployed! Version: $VERSION"
echo "Live at: https://punchthegame.com"
