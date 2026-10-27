#!/usr/bin/env bash
# NodePress one-line installer (Linux server with Docker):
#
#   curl -fsSL https://raw.githubusercontent.com/buildwithkode/nodepress/main/scripts/install.sh | bash
#
# With a domain (automatic HTTPS via Caddy + Let's Encrypt):
#
#   curl -fsSL https://raw.githubusercontent.com/buildwithkode/nodepress/main/scripts/install.sh \
#     | DOMAIN=cms.example.com ACME_EMAIL=you@example.com bash
#
# Options (environment variables):
#   DOMAIN       public hostname; its DNS must point here. Without it the site runs on http://<server-ip>
#   ACME_EMAIL   email for Let's Encrypt expiry notices (optional)
#   NODEPRESS_DIR  install directory (default: ./nodepress)
#   NODEPRESS_REF  git branch or tag (default: the newest vX.Y.Z release, else main;
#                  NODEPRESS_TRACK=main in .env keeps an install on main)
#
# Re-running it in an existing install directory updates to the newest release and
# restarts; DOMAIN and ACME_EMAIL are remembered in .env, so they needn't be repeated.
set -euo pipefail

REPO="https://github.com/buildwithkode/nodepress.git"
DIR="${NODEPRESS_DIR:-nodepress}"
REF="${NODEPRESS_REF:-}"
DOMAIN="${DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"

# Re-run in an existing install: keep the domain it was set up with, or the update
# would rewrite the URLs to http://<server-ip> and drop HTTPS.
env_value() { [ -f "$DIR/.env" ] && sed -n "s/^$1=//p" "$DIR/.env" | tail -n 1; }
[ -z "$DOMAIN" ] && DOMAIN="$(env_value DOMAIN || true)"
[ -z "$ACME_EMAIL" ] && ACME_EMAIL="$(env_value ACME_EMAIL || true)"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is required (apt install git)"
command -v docker >/dev/null 2>&1 || fail "Docker is required — https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (the 'docker compose' plugin)"
docker info >/dev/null 2>&1 || fail "Can't talk to the Docker daemon — is it running, and are you in the docker group (or root)?"

if [ -n "$DOMAIN" ]; then
  case "$DOMAIN" in
    *[!A-Za-z0-9.-]*|.*|*.) fail "DOMAIN must be a hostname like cms.example.com (no scheme or path)";;
  esac
  # Compose `!reset` (used by the HTTPS override) arrived in v2.24.
  ver="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
  major="${ver%%.*}"; rest="${ver#*.}"; minor="${rest%%.*}"
  if [ "${major:-0}" -lt 2 ] || { [ "${major:-0}" -eq 2 ] && [ "${minor:-0}" -lt 24 ]; }; then
    fail "HTTPS needs Docker Compose v2.24 or newer (found ${ver:-unknown})"
  fi
fi

# What to install: NODEPRESS_REF if given; otherwise the newest vX.Y.Z release (the
# same rule as create-nodepress-app). Installs made before releases were tracked
# followed main, which may be ahead of the newest tag — they stay on main rather
# than step back past migrations already applied.
TRACK="$(env_value NODEPRESS_TRACK || true)"
if [ -z "$REF" ] && [ -d "$DIR/.git" ] && [ -z "$TRACK" ]; then
  TRACK=main
fi
if [ -z "$REF" ] && [ "$TRACK" = main ]; then
  REF=main
elif [ -z "$REF" ]; then
  TRACK=release
  REF="$(git ls-remote --tags --refs "$REPO" 'v*' 2>/dev/null \
    | sed 's|.*refs/tags/||' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)"
  REF="${REF:-main}"
fi

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR ($REF)"
  git -C "$DIR" fetch --depth 1 origin "$REF"
  git -C "$DIR" checkout -q FETCH_HEAD
else
  [ -e "$DIR" ] && fail "$DIR exists and isn't a NodePress checkout — set NODEPRESS_DIR to another directory"
  say "Downloading NodePress ($REF) into $DIR"
  git clone --depth 1 --branch "$REF" "$REPO" "$DIR"
fi
cd "$DIR"

# .env: keep existing values, set the URL-related ones. Secrets (JWT, DB password)
# are generated on first start by the secrets-init service, not written here.
touch .env
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

[ -n "$TRACK" ] && set_env NODEPRESS_TRACK "$TRACK"

COMPOSE=(docker compose -f docker-compose.yml)
if [ -n "$DOMAIN" ]; then
  set_env DOMAIN "$DOMAIN"
  [ -n "$ACME_EMAIL" ] && set_env ACME_EMAIL "$ACME_EMAIL"
  set_env SITE_URL "https://$DOMAIN"
  set_env APP_URL "https://$DOMAIN"
  set_env CORS_ORIGIN "https://$DOMAIN"
  COMPOSE+=(-f docker-compose.https.yml)
  URL="https://$DOMAIN"
else
  HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
  HOST="${HOST:-localhost}"
  set_env SITE_URL "http://$HOST"
  set_env APP_URL "http://$HOST"
  set_env CORS_ORIGIN "http://$HOST"
  URL="http://$HOST"
fi
chmod 600 .env

say "Building and starting (the first build takes a few minutes)"
"${COMPOSE[@]}" up -d --build

say "Waiting for the API to come up"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T backend wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
    printf '\n\033[1;32m✔ NodePress is running at %s\033[0m\n' "$URL"
    printf '  Open %s/setup to create the admin account.\n' "$URL"
    [ -n "$DOMAIN" ] && printf '  The HTTPS certificate is issued on the first visit — make sure %s points at this server.\n' "$DOMAIN"
    printf '  Update later by running this installer again in %s.\n\n' "$(dirname "$PWD")"
    exit 0
  fi
  sleep 5
done
fail "The backend didn't become healthy in 5 minutes — check: ${COMPOSE[*]} logs backend"
