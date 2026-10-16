#!/bin/sh
#
# First-boot secret generation for docker-compose.yml.
#
# Runs once before the database and backend start. It writes JWT_SECRET and the
# Postgres password into the `secrets_data` volume, so a fresh install never runs
# with a secret that is published in this repository.
#
#   - A value passed in the environment (JWT_SECRET / DB_PASSWORD in .env) always
#     wins and is written through, so existing .env-based setups keep working.
#   - Otherwise a random value is generated on first boot and reused afterwards.
#   - Installs created before this script existed already have a Postgres data
#     directory initialised with the old default password. For those, the old
#     password is kept (or the backend could no longer connect) and a warning is
#     printed. The JWT secret is always regenerated, which only logs users out.
#
# Usage (inside the container): SECRETS_DIR=/secrets PGDATA_DIR=/pgdata sh secrets-init.sh

set -eu

SECRETS_DIR="${SECRETS_DIR:-/secrets}"
PGDATA_DIR="${PGDATA_DIR:-/pgdata}"
LEGACY_DB_PASSWORD="nodepress_secret"

mkdir -p "$SECRETS_DIR"

# 48 random bytes → 96 hex chars. Hex keeps the password safe inside a URL.
gen() { head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

write() { rm -f "$SECRETS_DIR/$1"; printf '%s' "$2" > "$SECRETS_DIR/$1"; }

if [ -n "${DB_PASSWORD:-}" ]; then
  write db_password "$DB_PASSWORD"
elif [ ! -s "$SECRETS_DIR/db_password" ]; then
  if [ -s "$PGDATA_DIR/PG_VERSION" ]; then
    write db_password "$LEGACY_DB_PASSWORD"
    echo "[secrets-init] WARNING: existing database uses the old default password." >&2
    echo "[secrets-init] Rotate it: set DB_PASSWORD in .env, then run ALTER USER ... PASSWORD in Postgres." >&2
  else
    write db_password "$(gen)"
    echo "[secrets-init] Generated a random database password."
  fi
fi

if [ -n "${JWT_SECRET:-}" ]; then
  write jwt_secret "$JWT_SECRET"
elif [ ! -s "$SECRETS_DIR/jwt_secret" ]; then
  write jwt_secret "$(gen)"
  echo "[secrets-init] Generated a random JWT secret."
fi

# Postgres reads POSTGRES_PASSWORD_FILE as the unprivileged `postgres` user, so
# the files must be world-readable inside the volume (Docker volumes themselves
# are only accessible to root on the host).
chmod 0755 "$SECRETS_DIR"
chmod 0444 "$SECRETS_DIR/db_password" "$SECRETS_DIR/jwt_secret"
