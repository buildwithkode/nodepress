#!/usr/bin/env bash
# Builds the server zips — NodePress without Docker:
#
#   bundles/nodepress-linux-x64.zip
#   bundles/nodepress-linux-arm64.zip   (+ .sha256 for each)
#
# The names carry no version, so the release's
# releases/latest/download/nodepress-linux-x64.zip link always gets the newest
# (the version is the release's, and in the zip's package.json).
#
# Unzip on a Linux server with Node.js 22, run `node server.js` (or point PM2,
# systemd or a hosting panel's Node.js app at server.js), open the site and
# finish in the browser (scripts/setup-wizard.js).
#
#   git checkout v1.9.0 && scripts/build-bundle.sh     # a release
#   BUNDLE_FROM_WORKTREE=1 scripts/build-bundle.sh     # test build of the working tree
#
# Runs on macOS or Linux with Node.js 22 and zip — no Docker. The build output
# is plain JavaScript; everything platform-specific is prebuilt (sharp, Prisma
# engines), so each zip just gets production dependencies installed for its
# platform (npm --os/--cpu/--libc) and the Prisma engines for Debian/Ubuntu and
# RHEL-family Linux (AlmaLinux, CloudLinux, Rocky) with OpenSSL 1.1 and 3.
# glibc only: Alpine (musl) and Windows aren't supported.
#
# Working files go to bundles/.work (next to the output, gitignored).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/bundles"
WORK="$OUT/.work"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v zip >/dev/null 2>&1 || fail "zip is required"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail "Node.js 22 or newer is required"

node scripts/check-versions.js
VERSION="$(node -p "require('./package.json').version")"

if [ -z "${BUNDLE_FROM_WORKTREE:-}" ]; then
  TAG="$(git describe --exact-match --tags HEAD 2>/dev/null || true)"
  [ "$TAG" = "v$VERSION" ] || fail "HEAD must be the tag v$VERSION (found: ${TAG:-no tag}) — or set BUNDLE_FROM_WORKTREE=1 for a test build"
  [ -z "$(git status --porcelain)" ] || fail "The working tree has changes — the zips must match the tag exactly"
  NAME="nodepress"
else
  NAME="nodepress-dev"
fi

rm -rf "$WORK"
mkdir -p "$WORK/build" "$WORK/home"
trap 'rm -rf "$WORK"' EXIT

# Downloads (npm packages for other platforms, Prisma engines) are cached next
# to the output rather than in the home folder.
export npm_config_cache="$OUT/.cache/npm"

# Source: tracked + untracked-but-not-ignored files (no node_modules, builds or .env).
git ls-files -z --cached --others --exclude-standard | xargs -0 tar -cf - | tar -xf - -C "$WORK/build"

say "Installing and building NodePress $VERSION${BUNDLE_FROM_WORKTREE:+ from the working tree} (a few minutes)"
cd "$WORK/build"
npm ci --no-audit --no-fund --loglevel=error >/dev/null
NODEPRESS_BUNDLE=1 npm run build >"$WORK/build.log" 2>&1 || { tail -40 "$WORK/build.log"; fail "Build failed"; }

for arch in x64 arm64; do
  case "$arch" in
    x64)   targets='debian-openssl-3.0.x,debian-openssl-1.1.x,rhel-openssl-3.0.x,rhel-openssl-1.1.x' ;;
    arm64) targets='linux-arm64-openssl-3.0.x,linux-arm64-openssl-1.1.x' ;;
  esac
  say "Assembling linux-$arch"
  S="$WORK/stage-$arch/nodepress"
  mkdir -p "$S/scripts" "$S/backend" "$S/frontend"
  cp package.json package-lock.json LICENSE server.js "$S/"
  cp scripts/data-dir.js scripts/setup-wizard.js scripts/backup.js "$S/scripts/"
  cp -R backend/package.json backend/dist backend/prisma backend/.env.example "$S/backend/"
  cp -R frontend/package.json frontend/next.config.js frontend/public frontend/.next "$S/frontend/"
  rm -rf "$S/frontend/.next/cache"

  # Engines for every Linux the zip supports.
  list="$(printf '"%s", ' ${targets//,/ })"
  node -e '
    const fs = require("fs"); const [file, list] = process.argv.slice(1);
    const s = fs.readFileSync(file, "utf8");
    const out = s.replace(/(generator client \{\n\s*provider\s*=\s*"prisma-client-js")/, `$1\n  binaryTargets = [${list}]`);
    if (out === s) throw new Error("generator block not found in schema.prisma");
    fs.writeFileSync(file, out);
  ' "$S/backend/prisma/schema.prisma" "${list%, }"

  # Production dependencies with the Linux binaries for this CPU. No install
  # scripts: nothing is compiled; Prisma's engines are fetched explicitly.
  (cd "$S" && npm ci --omit=dev --ignore-scripts --os=linux --cpu="$arch" --libc=glibc --no-audit --no-fund --loglevel=error >/dev/null)
  (cd "$S/backend" && export HOME="$OUT/.cache/home" \
    && mkdir -p "$HOME" \
    && PRISMA_CLI_BINARY_TARGETS="$targets" node ../node_modules/@prisma/engines/scripts/postinstall.js \
    && node ../node_modules/prisma/build/index.js generate >/dev/null)
  # Only the Linux engines belong in the zip (generate also fetches this machine's).
  find "$S/node_modules" \( -name '*darwin*' -o -name '*windows*' -o -name '*.dll.node' \) -path '*prisma*' -prune -exec rm -rf {} +
  # Build-time tools a running install never loads: Next's compiler (SWC, used
  # by `next build`/`next dev` only), the Sentry CLI (source-map upload at build),
  # sharp's slow WebAssembly fallback (the native build is included), the query
  # engines in @prisma/engines and the Prisma CLI's copies of them (the client
  # uses its own in .prisma; migrations need only the schema engine), Prisma's
  # WebAssembly engines for other databases, and TypeScript (installed only as
  # Prisma's optional peer dependency).
  rm -rf "$S"/node_modules/@next/swc-* "$S"/node_modules/@sentry/cli-* "$S/node_modules/@img/sharp-wasm32" \
    "$S"/node_modules/@prisma/engines/libquery_engine-* "$S"/node_modules/prisma/libquery_engine-* \
    "$S/node_modules/typescript"
  find "$S/node_modules/@prisma/client/runtime" "$S/node_modules/prisma/build" -maxdepth 1 \
    \( -name '*cockroachdb*' -o -name '*mysql*' -o -name '*sqlite*' -o -name '*sqlserver*' \) -delete

  # The zip is installed by unpacking, not by npm: keep only the scripts that
  # make sense there, and drop the symlinks (workspace links, .bin) that not
  # every unzip tool or hosting file manager keeps.
  (cd "$S" && node -e '
    const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json"));
    p.scripts = { start: "node server.js", backup: "node scripts/backup.js", restore: "node scripts/backup.js restore" };
    delete p.devDependencies;
    p.engines = { node: ">=22" };
    fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
  ')
  find "$S" -type l -delete

  zipfile="$OUT/$NAME-linux-$arch.zip"
  rm -f "$zipfile"
  (cd "$WORK/stage-$arch" && zip -qr -9 -X "$zipfile" nodepress)
  (cd "$OUT" && shasum -a 256 "$(basename "$zipfile")" > "$(basename "$zipfile").sha256")
  printf '  %s  %s\n' "$(du -h "$zipfile" | cut -f1)" "$(basename "$zipfile")"
done

printf '\n\033[1;32m✔ Built in %s\033[0m\n' "$OUT"
