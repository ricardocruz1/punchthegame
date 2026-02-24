#!/bin/bash
# Deploy to gh-pages with cache busting + env injection
# Source on main always has placeholders — keys only exist on gh-pages (the deploy branch)
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

# 1. Commit source changes to main (placeholders intact)
echo "=== Committing source to main ==="
git add .
git commit -m "$1" || echo "Nothing new to commit on main"
git push origin main

# 2. Build into temp directory
echo ""
echo "=== Building for deploy ==="
TMPDIR=$(mktemp -d)
VERSION=$(date +%s)

# Copy all site files (exclude dev-only files)
cp index.html "$TMPDIR/"
cp game.js "$TMPDIR/"
cp manifest.json "$TMPDIR/"
cp robots.txt "$TMPDIR/"
cp sitemap.xml "$TMPDIR/"
cp CNAME "$TMPDIR/"
cp *.png "$TMPDIR/"

# 3. Inject real keys + cache bust in the temp copy
sed -i '' "s|__SUPABASE_URL__|$SUPABASE_URL|g" "$TMPDIR/game.js"
sed -i '' "s|__SUPABASE_KEY__|$SUPABASE_KEY|g" "$TMPDIR/game.js"
sed -i '' "s|game\.js?v=[^\"]*|game.js?v=$VERSION|g" "$TMPDIR/index.html"

echo "Injected credentials + cache bust v=$VERSION"

# 4. Push to gh-pages branch
echo ""
echo "=== Deploying to gh-pages ==="
cd "$TMPDIR"
git init
git checkout -b gh-pages
git add .
git commit -m "Deploy: $1"
git remote add origin https://github.com/ricardocruz1/punchthegame.git
git push -f origin gh-pages

# 5. Clean up
rm -rf "$TMPDIR"

echo ""
echo "Deployed! Version: $VERSION"
echo "Live at: https://punchthegame.com"
