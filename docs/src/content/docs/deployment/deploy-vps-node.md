---
title: Deploy on a server without Docker
description: Step by step — install Node.js, PostgreSQL and Caddy on a Linux server, then run NodePress as two system services with automatic HTTPS.
sidebar:
  order: -1
---

This guide puts NodePress on a Linux server you rent (a VPS) **without Docker**: you install each part yourself and the server runs NodePress as two services. It takes about 45 minutes. You copy and paste every command.

If you don't need to avoid Docker, [Deploy on a server](/deployment/deploy-vps/) is shorter: one command installs everything.

You'll end up with the database, API and admin on one server, at `https://cms.example.com`. Use your own domain wherever this guide says `cms.example.com`.

| Part | What runs it |
|---|---|
| Database | PostgreSQL, installed from Ubuntu |
| API and admin | Node.js 22, as two systemd services that start again after a crash or a reboot |
| HTTPS and the address | Caddy, which gets and renews a free Let's Encrypt certificate by itself |

## 1. Create the server and point your domain at it

Follow steps 1–3 of [Deploy on a server](/deployment/deploy-vps/): an **Ubuntu 24.04** server with **2 GB of memory or more**, an `A` record for your domain pointing at its IP address, and a terminal on the server (`ssh root@<server-ip>`).

Everything from here on runs **on the server**, as `root`. On AWS Lightsail and other hosts where you log in as `ubuntu`, run `sudo -i` first.

## 2. Install the software

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs postgresql caddy git
```

This installs Node.js 22 (from NodeSource, the usual source for current Node.js on Ubuntu), PostgreSQL 16, Caddy and git. Check Node.js:

```bash
node --version
```

It should print `v22.` followed by more numbers.

**Server with less than 2 GB of memory?** Building the admin needs about 2 GB. Add swap first:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Turn on the firewall

Only SSH and the web ports should be reachable from the internet. The API and admin ports stay private behind Caddy:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Allow `OpenSSH` first, as here, or you'll lock yourself out.

## 4. Create the database

This makes a database user with a random password and prints the password. **Copy it**; you need it in step 6.

```bash
DB_PASSWORD="$(openssl rand -hex 24)"
sudo -u postgres psql -c "CREATE USER nodepress WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres createdb -O nodepress nodepress
echo "Database password: $DB_PASSWORD"
```

## 5. Download NodePress

NodePress runs as its own user, `nodepress`, not as `root`, so a fault in it can't take over the server:

```bash
useradd --system --create-home --home-dir /srv/nodepress --shell /bin/bash nodepress
sudo -iu nodepress
```

Your prompt now shows `nodepress@…`. Download the newest release:

```bash
git clone https://github.com/buildwithkode/nodepress.git app
cd app
git checkout "$(git tag -l 'v*' --sort=-v:refname | head -n 1)"
```

## 6. Write the settings

Replace `PASTE_PASSWORD` (twice) with the database password from step 4 and `cms.example.com` (three times) with your domain, then paste:

```bash
cat > backend/.env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://nodepress:PASTE_PASSWORD@127.0.0.1:5432/nodepress
DIRECT_URL=postgresql://nodepress:PASTE_PASSWORD@127.0.0.1:5432/nodepress
JWT_SECRET=$(openssl rand -hex 32)
APP_URL=https://cms.example.com
SITE_URL=https://cms.example.com
CORS_ORIGIN=https://cms.example.com
EOF
chmod 600 backend/.env
echo "BACKEND_URL=http://127.0.0.1:3000" > frontend/.env.local
```

`JWT_SECRET` is generated for you. It signs logins and encrypts the email and storage passwords you save in the admin, so it must stay the same: keep a copy of `backend/.env` somewhere safe.

## 7. Build NodePress

```bash
npm ci
npm run build
cd backend && npx prisma migrate deploy && cd ..
exit
```

`npm ci` installs exactly the versions NodePress was tested with, `npm run build` builds the API and the admin (5–10 minutes), and `prisma migrate deploy` creates the database tables. `exit` takes you back to `root`.

## 8. Run NodePress as services

Create the two services:

```bash
cat > /etc/systemd/system/nodepress-api.service <<'EOF'
[Unit]
Description=NodePress API
After=network.target postgresql.service

[Service]
User=nodepress
WorkingDirectory=/srv/nodepress/app/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/main.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/nodepress-admin.service <<'EOF'
[Unit]
Description=NodePress admin
After=network.target nodepress-api.service

[Service]
User=nodepress
WorkingDirectory=/srv/nodepress/app/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /srv/nodepress/app/node_modules/next/dist/bin/next start -p 3001
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nodepress-api nodepress-admin
```

Check both say `active (running)`:

```bash
systemctl status nodepress-api nodepress-admin --no-pager
```

`Restart=always` matters: NodePress stops itself after some admin changes (**Restart now** after a plugin or storage change) and expects to be started again.

## 9. Turn on HTTPS

Caddy sends the API's paths to port 3000 and everything else to the admin on port 3001. Replace `cms.example.com` and paste:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
cms.example.com {
	encode zstd gzip
	request_body {
		max_size 50MB
	}

	@preview path /api/draft /api/disable-draft
	handle @preview {
		reverse_proxy 127.0.0.1:3001
	}

	handle /api/metrics {
		respond 403
	}

	@api path /api/* /uploads/* /graphql /graphql/*
	handle @api {
		reverse_proxy 127.0.0.1:3000
	}

	handle {
		reverse_proxy 127.0.0.1:3001
	}
}
EOF
systemctl reload caddy
```

Caddy gets the certificate on the first visit, which needs the DNS record from step 1 to point at this server. Live updates (`/api/realtime`) go through the same route; Caddy passes WebSockets through by itself.

## 10. Create the admin account

Open `https://cms.example.com/setup` and enter the site name and the first admin's email and password. Then set up email under **Settings → Email & storage**, as in [step 7 of the Docker guide](/deployment/deploy-vps/#7-set-up-email).

Uploads are stored in `/srv/nodepress/app/backend/uploads`. To keep them off the server, use [S3-compatible storage](/deployment/storage/).

## Backups

A nightly database dump, kept for 14 days:

```bash
mkdir -p /root/backups
( crontab -l 2>/dev/null; echo '0 3 * * * sudo -u postgres pg_dump --format=custom nodepress > /root/backups/nodepress-$(date +\%F).dump && find /root/backups -name "nodepress-*.dump" -mtime +14 -delete' ) | crontab -
```

Also copy `/srv/nodepress/app/backend/.env` and the `uploads` folder somewhere safe now and then. Turning on your provider's server backups covers all of it. See [Backups](/deployment/backups/).

## Updating

Read the notes for the new version in [UPGRADING.md](https://github.com/buildwithkode/nodepress/blob/main/UPGRADING.md) first, and back up the database. Then:

```bash
sudo -iu nodepress
cd app
git fetch --tags
git checkout "$(git tag -l 'v*' --sort=-v:refname | head -n 1)"
npm ci
npm run build
cd backend && npx prisma migrate deploy && cd ..
exit
systemctl restart nodepress-api nodepress-admin
```

Your content, uploads and settings stay as they are.

## If something goes wrong

The logs are the first place to look:

```bash
journalctl -u nodepress-api -n 100 --no-pager      # the API
journalctl -u nodepress-admin -n 100 --no-pager    # the admin
journalctl -u caddy -n 100 --no-pager              # HTTPS and routing
```

| Problem | What to do |
|---|---|
| The API log lists environment problems, such as `JWT_SECRET must be at least 32 characters` | Fix that line in `backend/.env`, then `systemctl restart nodepress-api`. |
| `password authentication failed for user "nodepress"` | The password in `DATABASE_URL` doesn't match step 4. Set a new one with `sudo -u postgres psql -c "ALTER USER nodepress WITH PASSWORD 'new-password';"` and put it in both URLs. |
| The build stops with `Killed` or `JavaScript heap out of memory` | Add swap (step 2) and run `npm run build` again. |
| The browser shows a certificate error | DNS doesn't point at the server yet, or ports 80/443 are blocked. Check with `dig +short cms.example.com`, wait a few minutes and `systemctl reload caddy`. On Cloudflare, use **DNS only**. |
| `502 Bad Gateway` | One of the services isn't running. Check `systemctl status nodepress-api nodepress-admin`. |
