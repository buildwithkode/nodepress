---
title: Install from the server zip
description: Download one zip, unzip it on a Linux server, start it and finish the setup in your browser — no Docker, no build.
sidebar:
  order: -1
---

The server zip is NodePress ready to run: the API and the admin already built, every dependency included, for Linux on x64 or arm64. You unzip it, start it with Node.js and finish in the browser, much like installing WordPress. There's nothing to build, so it also runs on small servers.

| Zip | For |
|---|---|
| `nodepress-linux-x64.zip` | Most servers (Intel and AMD) |
| `nodepress-linux-arm64.zip` | ARM servers: AWS Graviton, Hetzner CAX, Oracle Ampere |

Both are on the [Releases page](https://github.com/buildwithkode/nodepress/releases/latest), with a `.sha256` checksum next to each.

**What the server needs**

- Linux with glibc: Ubuntu 20.04 or newer, Debian 11 or newer, AlmaLinux / Rocky / CloudLinux 8 or newer. Alpine isn't supported.
- **Node.js 22** or newer.
- **PostgreSQL 12** or newer: on the same server, or a hosted one (Supabase, Neon, your host's). An empty database. MySQL won't work.
- About **1 GB of memory** for NodePress and **1 GB of disk** for the unpacked app.

On shared hosting with cPanel, follow [Install on cPanel hosting](/deployment/deploy-cpanel/) instead.

## On your own server (VPS)

This puts NodePress on an Ubuntu server with automatic HTTPS from Caddy. It takes about 20 minutes. Create the server and point your domain at it as in steps 1–3 of [Deploy on a server with Docker](/deployment/deploy-vps/), then run everything below on the server as `root` (`sudo -i` first if you log in as `ubuntu`). Use your own domain wherever this says `cms.example.com`.

### 1. Install Node.js, PostgreSQL and Caddy

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs postgresql caddy unzip
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

The firewall keeps NodePress's own port (3000) private: only Caddy reaches it.

### 2. Create the database

This prints a random password for the database. **Copy it**; the setup page asks for it.

```bash
DB_PASSWORD="$(openssl rand -hex 24)"
sudo -u postgres psql -c "CREATE USER nodepress WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres createdb -O nodepress nodepress
echo "Database password: $DB_PASSWORD"
```

### 3. Download and unzip NodePress

NodePress runs as its own user, not as `root`:

```bash
useradd --system --create-home --home-dir /srv/nodepress --shell /bin/bash nodepress
cd /srv/nodepress
curl -fLO https://github.com/buildwithkode/nodepress/releases/latest/download/nodepress-linux-x64.zip
unzip -q nodepress-linux-x64.zip && rm nodepress-linux-x64.zip
chown -R nodepress:nodepress /srv/nodepress
```

On an ARM server, use `nodepress-linux-arm64.zip` in both places. This makes `/srv/nodepress/nodepress`, the app. Your settings, uploads and plugins go in `/srv/nodepress/nodepress-data` next to it, so an update can replace the app folder without touching them.

### 4. Run it as a service

```bash
cat > /etc/systemd/system/nodepress.service <<'EOF'
[Unit]
Description=NodePress
After=network.target postgresql.service

[Service]
User=nodepress
WorkingDirectory=/srv/nodepress/nodepress
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nodepress
```

`Restart=always` matters: NodePress stops itself after some admin changes (**Restart now** after a plugin or storage change) and expects to be started again.

### 5. Turn on HTTPS

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
cms.example.com {
	encode zstd gzip
	request_body {
		max_size 50MB
	}
	handle /api/metrics {
		respond 403
	}
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy
```

One process serves the API and the admin, so everything goes to port 3000.

### 6. Finish in the browser

NodePress prints a one-time **setup code** when it starts without settings. Show it with:

```bash
journalctl -u nodepress -n 30 --no-pager
```

Open `https://cms.example.com` and the setup page asks for:

1. **The setup code.** It stops anyone else who finds the page first from installing it. After 10 wrong codes the page locks until NodePress restarts.
2. **The database.** Host `localhost`, port `5432`, database `nodepress`, user `nodepress` and the password from step 2. Or paste a connection string: from Supabase, Neon or your host, tick **Requires SSL**. **Test connection** checks it before anything is written.
3. **The site address**, filled in from the address bar.

**Install NodePress** creates the tables, saves the settings in `/srv/nodepress/nodepress-data/.env` and starts NodePress. You then create the first admin account. Set up email next under **Settings → Email & storage**.

`.env` holds `JWT_SECRET`, which signs logins and encrypts the passwords saved in the admin: keep a copy of it somewhere safe.

## With PM2 instead of systemd

If you already use [PM2](https://pm2.keymetrics.io/), as the `nodepress` user:

```bash
cd /srv/nodepress/nodepress
pm2 start server.js --name nodepress
pm2 save
```

Run `pm2 startup` once and follow what it prints, so PM2 starts again after a reboot. The setup code is in `pm2 logs nodepress`.

## Settings

| Variable | What it does |
|---|---|
| `PORT` | The port NodePress listens on. Default `3000`. |
| `NODEPRESS_DATA` | Where settings, uploads and plugins live. Default: `nodepress-data` next to the app folder. |
| `NODEPRESS_MIGRATE` | `0` stops NodePress applying database updates when it starts. |

Set them in the service (`Environment=PORT=3100` under `[Service]`), not in `.env`: NodePress reads them before it loads `.env`. Everything else is in `.env`, documented in `backend/.env.example` inside the zip.

## Updating

Read the notes for the new version in [UPGRADING.md](https://github.com/buildwithkode/nodepress/blob/main/UPGRADING.md) and make a backup (below). Then replace the app folder:

```bash
cd /srv/nodepress
curl -fLO https://github.com/buildwithkode/nodepress/releases/latest/download/nodepress-linux-x64.zip
systemctl stop nodepress
mv nodepress nodepress-old
unzip -q nodepress-linux-x64.zip && rm nodepress-linux-x64.zip
chown -R nodepress:nodepress nodepress
systemctl start nodepress
```

NodePress applies the database updates when it starts (`✔ Database up to date` in the log). Once it works, `rm -rf nodepress-old`. To go back, stop it and move `nodepress-old` back; if the new version changed the database, restore the backup too.

## Backups

The zip includes the backup script. It needs the PostgreSQL client tools (`apt-get install -y postgresql-client`, already there with PostgreSQL on the same server):

```bash
sudo -u nodepress bash -c 'cd /srv/nodepress/nodepress && npm run backup'
```

It writes the database and uploads to `/srv/nodepress/nodepress-data/backups/nodepress-<time>.tar.gz`. Copy those off the server now and then, along with `.env`. See [Backups](/deployment/backups/) for restoring.

## If something goes wrong

Start with the log: `journalctl -u nodepress -n 100 --no-pager`.

| Problem | What to do |
|---|---|
| `NodePress isn't built yet` | The zip didn't unpack fully. Unzip it again. |
| `Permission denied` or `EACCES` | The `nodepress` user can't write its folders: `chown -R nodepress:nodepress /srv/nodepress`. |
| The setup page says the code is wrong | Copy the code from the **newest** start in the log; each start prints a new one. After 10 wrong codes, `systemctl restart nodepress`. |
| `This database already has other tables` | Use an empty database for NodePress. A database that already has NodePress's tables is fine: they're kept and updated. |
| `The database couldn't be updated` | The database is unreachable, or the update failed. The lines above it say which. NodePress doesn't start on a half-updated database. |
| `502 Bad Gateway` | NodePress isn't running: `systemctl status nodepress`. |
