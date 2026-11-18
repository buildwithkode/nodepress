#!/usr/bin/env bash
#
# Checks the per-workspace lockfiles the Docker images are built from.
#
# backend/Dockerfile and frontend/Dockerfile build with their own directory as
# the context, so `npm ci` there uses backend/package-lock.json and
# frontend/package-lock.json, NOT the root workspace lockfile — and ignores the
# root "overrides". Local installs and the pre-push tests all use the root
# lockfile, so these two can silently rot: an out-of-sync lockfile makes
# `docker build` fail, and a stale one ships old, vulnerable versions.
#
# For each workspace this copies package.json + package-lock.json into a temp
# directory (outside the workspace, exactly like a Docker build context) and:
#   1. `npm ci --dry-run`   — the lockfile matches package.json and installs
#   2. `scripts/check-audit.js <dir>` — no unreviewed high/critical runtime advisories
#
# Usage:
#   scripts/check-docker-lockfiles.sh          # check (exit 1 on any problem)
#   scripts/check-docker-lockfiles.sh --fix    # re-resolve missing entries and apply
#                                              # non-breaking audit fixes, then check
#
# --fix keeps every version already pinned that still satisfies package.json and
# only touches the per-workspace lockfiles — never the root package-lock.json.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX=0
[[ "${1:-}" == "--fix" ]] && FIX=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

status=0
for ws in backend frontend; do
  dir="$TMP/$ws"
  mkdir -p "$dir"
  cp "$ROOT/$ws/package.json" "$ROOT/$ws/package-lock.json" "$dir/"

  if [[ $FIX -eq 1 ]]; then
    echo "[lockfiles] $ws: re-resolving lockfile…"
    ( cd "$dir" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund --silent )
    ( cd "$dir" && npm audit fix --package-lock-only --ignore-scripts --no-fund --silent >/dev/null 2>&1 || true )
    cp "$dir/package-lock.json" "$ROOT/$ws/package-lock.json"
  fi

  if ( cd "$dir" && npm ci --dry-run --ignore-scripts --no-audit --no-fund >/dev/null 2>"$dir/ci.err" ); then
    echo "[lockfiles] $ws: npm ci OK"
  else
    echo "[lockfiles] $ws: npm ci FAILS — the Docker build would break:"
    grep -E "npm error" "$dir/ci.err" | head -5 | sed 's/^/    /'
    status=1
    continue
  fi

  # Same rules as the root audit, including its reviewed advisories.
  if audit_out="$(node "$ROOT/scripts/check-audit.js" "$dir" 2>&1)"; then
    echo "[lockfiles] $ws: no unreviewed high/critical runtime advisories"
  else
    echo "[lockfiles] $ws: high/critical runtime advisories in the Docker image:"
    echo "$audit_out" | sed 's/^/    /'
    status=1
  fi
done

if [[ $status -ne 0 ]]; then
  echo "[lockfiles] Run scripts/check-docker-lockfiles.sh --fix, or fix package.json overrides."
fi
exit $status
