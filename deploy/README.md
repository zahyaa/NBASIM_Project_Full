# NBASIM Deployment — Netlify (frontend) + Ubuntu (API)

```
 Browser ──► https://bballsim.app           (Netlify, static React build)
         └─► https://api.bballsim.app/api/* (Ubuntu, Nginx → Node :5001 → MongoDB Atlas)
```

## 1. Frontend on Netlify

1. Push this repo to GitHub.
2. Netlify dashboard → **Add new site → Import from Git** → pick the repo.
3. Build settings auto-detect from [netlify.toml](../netlify.toml). Confirm:
   - Base directory: `client`
   - Build command: `CI=false NODE_OPTIONS=--openssl-legacy-provider npm run build`
   - Publish directory: `client/build`
4. **Site settings → Environment variables**:
   ```
   REACT_APP_API_URL=https://api.bballsim.app
   ```
5. **Domain management** → add custom domain `bballsim.app`, enable HTTPS (auto Let's Encrypt).
6. Trigger a deploy. The SPA fallback (`/* → /index.html`) is configured in `netlify.toml`.

## 2. Backend on Ubuntu

Tested on Ubuntu 22.04/24.04. Run as root or with `sudo`.

```bash
# 2a. System packages
apt update && apt install -y nginx git curl ca-certificates ufw
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 2b. Service user + checkout
useradd --system --home /srv/nbasim --shell /usr/sbin/nologin nbasim
mkdir -p /srv/nbasim && chown nbasim:nbasim /srv/nbasim
sudo -u nbasim git clone https://github.com/zahyaa/NBASIM_Project_Full.git /srv/nbasim/app
sudo -u nbasim bash -lc 'cd /srv/nbasim/app/server && npm ci --omit=dev'
sudo -u nbasim mkdir -p /srv/nbasim/app/server/uploads

# 2c. Environment file (edit with real secrets)
install -m 600 -o nbasim -g nbasim \
  /srv/nbasim/app/deploy/nbasim.env.example /srv/nbasim/nbasim.env
$EDITOR /srv/nbasim/nbasim.env

# 2d. systemd service
cp /srv/nbasim/app/deploy/nbasim-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nbasim-api
journalctl -u nbasim-api -n 50 --no-pager
```

## 3. Nginx + TLS

```bash
cp /srv/nbasim/app/deploy/nginx-nbasim.conf /etc/nginx/sites-available/nbasim-api.conf
ln -s /etc/nginx/sites-available/nbasim-api.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.bballsim.app
```

## 4. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 5. DNS

| Type  | Name | Value                                |
| ----- | ---- | ------------------------------------ |
| A     | api  | <Ubuntu server public IP>            |
| CNAME | @    | (Netlify load-balancer hostname)     |
| CNAME | www  | (Netlify load-balancer hostname)     |

## 6. Updating

```bash
sudo -u nbasim bash -lc 'cd /srv/nbasim/app && git pull && cd server && npm ci --omit=dev'
sudo systemctl restart nbasim-api
```

Netlify auto-deploys on every push to the default branch.

## 7. Smoke tests

```bash
curl -s https://api.bballsim.app/healthz                  # → {"ok":true}
curl -s https://api.bballsim.app/api/auth/me              # → 401 unauthorized (expected)
```

Then in a browser, log in at `https://bballsim.app` and watch the network panel —
all `/api/...` requests should hit `api.bballsim.app` over HTTPS.
