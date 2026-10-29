#!/usr/bin/env node
/**
 * Fails when a dependency with an install script has no decision in the root
 * package.json's `allowScripts`.
 *
 * Why this exists:
 *   npm 12 no longer runs dependency install scripts (preinstall, install,
 *   postinstall, implicit node-gyp builds) unless `allowScripts` allows them.
 *   NodePress works with all of them blocked — Prisma ships or fetches what
 *   it needs — but a new dependency might not, and npm only says so in a
 *   warning at the end of an install. Every package with a script must be
 *   listed as true (allowed) or false (reviewed, not needed) so a new one shows
 *   up here instead of as a silent breakage on someone's npm 12 install.
 *
 *   The list lives in the root package.json only: npm ignores (and warns
 *   about) allowScripts in workspace package.json files. The Docker images
 *   install backend/ and frontend/ on their own and work without it.
 *
 * Checks every package marked hasInstallScript in the three lockfiles.
 * Run: node scripts/check-install-scripts.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCKFILES = ['package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json'];

const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).allowScripts ?? {};
// Entries may be name-only ("prisma") or pinned ("prisma@6.19.3").
const decided = new Set(Object.keys(allow).map((k) => k.replace(/@[^@/]+$/, '')));

const missing = new Map(); // package → lockfiles
for (const lock of LOCKFILES) {
  const file = path.join(ROOT, lock);
  if (!fs.existsSync(file)) continue;
  const { packages = {} } = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, entry] of Object.entries(packages)) {
    if (!key || !entry.hasInstallScript) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!decided.has(name)) missing.set(name, [...(missing.get(name) ?? []), lock]);
  }
}

if (missing.size) {
  console.error('[install-scripts] these dependencies have install scripts but no allowScripts decision in package.json:');
  for (const [name, locks] of missing) console.error(`  ${name}  (${locks.join(', ')})`);
  console.error('Review what each script does, then add "name": true (needed) or false (not needed) to allowScripts.');
  process.exit(1);
}
console.log(`[install-scripts] OK — ${decided.size} dependencies with install scripts reviewed`);
