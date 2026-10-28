#!/usr/bin/env bash
# Builds and publishes the release images from this machine — the same job as
# .github/workflows/release.yml, for when GitHub Actions isn't running.
#
#   docker login ghcr.io          # once; a token with the write:packages scope
#   git checkout v1.8.0
#   scripts/release-images.sh
#
# 1. checks HEAD is the vX.Y.Z tag matching every manifest, with a clean tree;
# 2. builds both images for this machine and starts the stack from them (smoke
#    test: /api/health and /setup through nginx on port 80);
# 3. builds linux/amd64 + linux/arm64 and pushes X.Y.Z, X.Y and latest
#    (a pre-release such as 1.8.0-rc.1 gets only its own tag).
#
# Options (environment variables):
#   NODEPRESS_IMAGE_PREFIX  registry/owner (default ghcr.io/buildwithkode)
#   SKIP_SMOKE=1            skip step 2
#
# The non-native platform builds under emulation (Docker Desktop includes it;
# on Linux install qemu: docker run --privileged --rm tonistiigi/binfmt --install all),
# which is slow — expect 20–40 minutes for the first run.
set -euo pipefail

cd "$(dirname "$0")/.."
PREFIX="${NODEPRESS_IMAGE_PREFIX:-ghcr.io/buildwithkode}"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER="nodepress-release"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is required"
docker buildx version >/dev/null 2>&1 || fail "docker buildx is required (included with Docker Desktop)"

# ── 1. The tag ───────────────────────────────────────────────────────────────
node scripts/check-versions.js
VERSION="$(node -p "require('./package.json').version")"
TAG="$(git describe --exact-match --tags HEAD 2>/dev/null || true)"
[ "$TAG" = "v$VERSION" ] || fail "HEAD must be the tag v$VERSION (found: ${TAG:-no tag}) — git checkout v$VERSION"
[ -z "$(git status --porcelain)" ] || fail "The working tree has changes — the images must match the tag exactly"

TAGS=("$VERSION")
if [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  TAGS+=("${VERSION%.*}" latest)
fi

# Multi-platform pushes need a docker-container builder.
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  say "Creating the $BUILDER buildx builder"
  docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
fi

# ── 2. Smoke test with images for this machine ───────────────────────────────
if [ -z "${SKIP_SMOKE:-}" ]; then
  say "Building the images for this machine"
  for s in backend frontend; do
    docker buildx build --builder "$BUILDER" --load \
      -t "$PREFIX/nodepress-$s:smoke" "./$s"
  done

  say "Starting the stack from them (needs port 80 free)"
  export NODEPRESS_IMAGE_PREFIX="$PREFIX" NODEPRESS_VERSION=smoke
  SMOKE=(docker compose -p nodepress-release-smoke)
  cleanup() { "${SMOKE[@]}" down -v >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  "${SMOKE[@]}" up -d --no-build

  up=""
  for _ in $(seq 1 60); do
    if curl -fsS http://localhost/api/health >/dev/null 2>&1 \
      && curl -fsS -o /dev/null http://localhost/setup 2>/dev/null; then
      up=1; break
    fi
    sleep 5
  done
  if [ -z "$up" ]; then
    "${SMOKE[@]}" logs --tail 100 backend frontend nginx || true
    fail "The stack didn't come up in 5 minutes — nothing was pushed"
  fi
  say "Smoke test passed"
  cleanup
  trap - EXIT
fi

# ── 3. Build every platform and push ─────────────────────────────────────────
for s in backend frontend; do
  args=()
  for t in "${TAGS[@]}"; do args+=(-t "$PREFIX/nodepress-$s:$t"); done
  say "Building and pushing nodepress-$s ($PLATFORMS): ${TAGS[*]}"
  docker buildx build --builder "$BUILDER" --platform "$PLATFORMS" --push \
    --label "org.opencontainers.image.source=https://github.com/buildwithkode/nodepress" \
    --label "org.opencontainers.image.version=$VERSION" \
    --label "org.opencontainers.image.licenses=MIT" \
    "${args[@]}" "./$s"
done

printf '\n\033[1;32m✔ Published %s/nodepress-backend and nodepress-frontend %s\033[0m\n' "$PREFIX" "${TAGS[*]}"
printf '  First release? Make both packages public on GitHub (Package settings → Change visibility).\n'
