#!/bin/bash
# Quick AWS update — run after SSH: bash deploy/update-aws.sh
set -e

APP_DIR="${APP_DIR:-$HOME/almahyai}"
cd "$APP_DIR"

echo "=== Pull latest ==="
git pull origin main

echo "=== Build backend ==="
cd backend
npm install
npm run build

echo "=== Restart API ==="
pm2 restart almahyai-api || pm2 start npm --name almahyai-api -- run start
pm2 save

echo "=== Verify ==="
sleep 2
curl -s http://127.0.0.1:3847/api/health
echo
curl -s http://127.0.0.1:3847/api/engines || echo "(engines endpoint missing — pull failed?)"
echo
echo "Done. Restart Almahy AI desktop app and check for Neural Merge badge."
