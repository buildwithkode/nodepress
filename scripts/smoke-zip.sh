#!/usr/bin/env bash
# Smoke test of a server zip: unpack it into a temporary folder and start it
# the way a server would.
#
#   DATABASE_URL=postgresql://…/empty_db scripts/smoke-zip.sh bundles/nodepress-linux-x64.zip
#
# 1. without settings, the setup page answers (/api/health → 503 "setup") and
#    writes setup-code.txt;
# 2. with a .env pointing at DATABASE_URL (an EMPTY database — the zip creates
#    its tables), NodePress applies the migrations and serves /api/health and
#    the admin's /setup.
#
# Runs on Linux only (the zip's binaries are Linux ones), with Node.js 22,
# unzip and curl. Used by .github/workflows/release.yml and
# scripts/release-zips.sh (which runs it in a container on macOS).
set -euo pipefail

ZIP="${1:?usage: DATABASE_URL=… scripts/smoke-zip.sh <zip>}"
: "${DATABASE_URL:?DATABASE_URL must point at an empty PostgreSQL database}"
PORT="${SMOKE_PORT:-3000}"

fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"
if [ -f "$ZIP.sha256" ]; then (cd "$(dirname "$ZIP")" && sha256sum -c "$(basename "$ZIP").sha256" >/dev/null) || fail "Checksum mismatch"; fi

TMP="$(mktemp -d)"
pid=""
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
unzip -q "$ZIP" -d "$TMP"
APP="$TMP/nodepress"
DATA="$TMP/nodepress-data"
cd "$APP"

# ── 1. No settings: the setup page ───────────────────────────────────────────
PORT="$PORT" node server.js >"$TMP/setup.log" 2>&1 &
pid=$!
code=""
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" || true)"
  [ "$code" = 503 ] && break
  sleep 2
done
kill "$pid"; wait "$pid" 2>/dev/null || true; pid=""
[ "$code" = 503 ] || { cat "$TMP/setup.log"; fail "The setup page didn't start"; }
[ -s "$DATA/setup-code.txt" ] || fail "No setup-code.txt in the data folder"
echo "✔ Setup page answers"

# ── 2. With settings: migrations, API and admin ──────────────────────────────
cat >"$DATA/.env" <<ENV
NODE_ENV=production
PORT=$PORT
DATABASE_URL="$DATABASE_URL"
DIRECT_URL="$DATABASE_URL"
JWT_SECRET=$(node -p "require('crypto').randomBytes(32).toString('hex')")
APP_URL=http://localhost:$PORT
SITE_URL=http://localhost:$PORT
CORS_ORIGIN=http://localhost:$PORT
ENV
node server.js >"$TMP/server.log" 2>&1 &
pid=$!
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1 \
    && curl -fsS -o /dev/null "http://localhost:$PORT/setup"; then
    grep -q 'Database up to date' "$TMP/server.log" || { cat "$TMP/server.log"; fail "No migration run in the log"; }
    echo "✔ API and admin are up from the zip"
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 5
done
tail -60 "$TMP/server.log"
fail "NodePress didn't come up from the zip"
