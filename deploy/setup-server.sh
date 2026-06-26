#!/bin/bash
# Run on AWS EC2 after SSH: bash deploy/setup-server.sh
set -e

echo "=== Almahy AI server setup ==="

APP_DIR="${APP_DIR:-$HOME/almahyai}"
if [ ! -d "$APP_DIR/backend" ]; then
  echo "Cloning repo..."
  git clone https://github.com/althakeel/almahyai.git "$APP_DIR"
fi

cd "$APP_DIR"
git pull origin main || true

echo "=== Backend ==="
cd backend
if [ ! -f .env ]; then
  echo "ERROR: Create backend/.env first (copy from .env.example and add MongoDB password + GEMINI_API_KEY)"
  exit 1
fi
npm install
npm run build
pm2 delete almahyai-api 2>/dev/null || true
pm2 start npm --name almahyai-api -- run start
pm2 save

echo "=== Nginx ==="
sudo tee /etc/nginx/sites-available/almahyai > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:3847/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location = / {
        return 200 'Almahy AI server is running. Use the desktop app to sign in.';
        add_header Content-Type text/plain;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/almahyai /etc/nginx/sites-enabled/almahyai
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "=== Tests ==="
sleep 2
echo -n "Backend direct: "
curl -s http://127.0.0.1:3847/api/health || echo "FAILED"
echo
echo -n "Via nginx:      "
curl -s http://127.0.0.1/api/health || echo "FAILED"
echo
echo "=== Done ==="
echo "Test from your PC browser: http://3.111.219.248/api/health"
