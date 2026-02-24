#!/bin/bash
# Auto-deploy with cache busting + env injection
# Usage: ./deploy.sh "commit message"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy.sh \"commit message\""
  exit 1
fi

# Load .env
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Create it with SUPABASE_URL and SUPABASE_KEY."
  exit 1
fi
source .env

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env"
  exit 1
fi

# Generate a unique version string (unix timestamp)
VERSION=$(date +%s)

# Update the cache-busting version in index.html
sed -i '' "s|game\.js?v=[^\"]*|game.js?v=$VERSION|g" index.html

echo "Cache bust: game.js?v=$VERSION"

# Inject real Supabase credentials into game.js for deploy
sed -i '' "s|__SUPABASE_URL__|$SUPABASE_URL|g" game.js
sed -i '' "s|__SUPABASE_KEY__|$SUPABASE_KEY|g" game.js

echo "Injected Supabase credentials"

# Stage all tracked changes + new files (respects .gitignore)
git add .
git commit -m "$1"
git push origin main

echo ""
echo "Deployed! Version: $VERSION"
echo "Live at: https://punchthegame.com"

# Restore placeholders in working copy so keys aren't sitting in source
sed -i '' "s|$SUPABASE_URL|__SUPABASE_URL__|g" game.js
sed -i '' "s|$SUPABASE_KEY|__SUPABASE_KEY__|g" game.js

echo "Restored placeholders in working copy"
