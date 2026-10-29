#!/usr/bin/env bash
# Builds the server zips, smoke-tests one and attaches both to the GitHub
# release — the zip half of .github/workflows/release.yml, for when GitHub
# Actions isn't running. Run it after scripts/release-images.sh.
#
#   gh auth login                 # once
#   git checkout v1.9.0
#   scripts/release-zips.sh
#
# 1. scripts/build-bundle.sh (checks HEAD is the vX.Y.Z tag, clean tree);
# 2. scripts/smoke-zip.sh on the zip for this machine's CPU, in a node:22
#    container against a throwaway postgres:16 container (Docker needed;
#    SKIP_SMOKE=1 skips it);
# 3. creates the GitHub release vX.Y.Z with the version's CHANGELOG section as
#    notes and the zips attached, or replaces the zips on an existing release.
#    A pre-release (1.9.0-rc.1) is marked as one, so releases/latest/download/
#    keeps pointing at the newest full release.
#
# SKIP_BUILD=1 uses the zips already in bundles/ (the workflow downloads them).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
REPO="${NODEPRESS_REPO:-buildwithkode/nodepress}"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "The GitHub CLI (gh) is required"
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

# ── 1. Build ─────────────────────────────────────────────────────────────────
[ -n "${SKIP_BUILD:-}" ] || bash scripts/build-bundle.sh
ZIPS=("$ROOT"/bundles/nodepress-linux-x64.zip "$ROOT"/bundles/nodepress-linux-arm64.zip)
for z in "${ZIPS[@]}"; do [ -f "$z" ] && [ -f "$z.sha256" ] || fail "Missing $z (or its .sha256)"; done

# ── 2. Smoke test ────────────────────────────────────────────────────────────
if [ -z "${SKIP_SMOKE:-}" ]; then
  command -v docker >/dev/null 2>&1 || fail "Docker is required for the smoke test (or SKIP_SMOKE=1)"
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; *) arch=x64 ;; esac
  say "Smoke-testing nodepress-linux-$arch.zip in a container"
  net="nodepress-zip-smoke"
  cleanup() { docker rm -f "$net-db" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  cleanup
  docker network create "$net" >/dev/null
  docker run -d --name "$net-db" --network "$net" -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=nodepress postgres:16 >/dev/null
  docker run --rm --network "$net" -v "$ROOT/bundles:/bundles:ro" -v "$ROOT/scripts:/scripts:ro" \
    -e DATABASE_URL="postgresql://postgres:smoke@$net-db:5432/nodepress" node:22 bash -c '
      set -e
      for _ in $(seq 1 30); do (echo > /dev/tcp/'"$net-db"'/5432) 2>/dev/null && break; sleep 1; done
      command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip >/dev/null; }
      bash /scripts/smoke-zip.sh /bundles/nodepress-linux-'"$arch"'.zip' \
    || fail "The smoke test failed — nothing was published"
  cleanup
  trap - EXIT
fi

# ── 3. The GitHub release ────────────────────────────────────────────────────
notes="$(mktemp)"
awk -v h="## [$VERSION]" 'index($0, h) == 1 { f = 1; next } /^## \[/ { if (f) exit } f' CHANGELOG.md >"$notes"
[ -s "$notes" ] || fail "No ## [$VERSION] section in CHANGELOG.md"
files=()
for z in "${ZIPS[@]}"; do files+=("$z" "$z.sha256"); done
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  say "Replacing the zips on release $TAG"
  gh release upload "$TAG" -R "$REPO" "${files[@]}" --clobber
else
  say "Creating release $TAG"
  flags=()
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || flags+=(--prerelease)
  gh release create "$TAG" -R "$REPO" "${files[@]}" --verify-tag --title "NodePress $VERSION" --notes-file "$notes" ${flags[@]+"${flags[@]}"}
fi
rm -f "$notes"
printf '\n\033[1;32m✔ %s has the server zips: https://github.com/%s/releases/tag/%s\033[0m\n' "$TAG" "$REPO" "$TAG"
