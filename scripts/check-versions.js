#!/usr/bin/env node
/**
 * Fails when the repo disagrees with itself about what version it is.
 *
 * Why this exists:
 *   Before 1.6.0 the root, backend and frontend manifests all said 1.0.0 while
 *   cli/ said 1.3.0, and CHANGELOG.md listed 1.3.0 twice — once on 2026-04-19
 *   and again on 2026-06-04, the second time *after* 1.4.0 and 1.5.0 had already
 *   shipped. So a release went backwards and reused a number, and nothing in the
 *   repo agreed on the current version. None of that is visible in a diff, and
 *   no test catches it, so it survived several releases.
 *
 * Checks:
 *   1. every package.json carries the same version
 *   2. CHANGELOG.md lists each version exactly once
 *   3. those versions are in strictly descending order
 *   4. the manifest version is >= the newest released changelog entry
 *
 * Run: node scripts/check-versions.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFESTS = ['package.json', 'backend/package.json', 'frontend/package.json', 'cli/package.json'];

const problems = [];
const note = (m) => problems.push(m);

// ── 1. manifests agree ───────────────────────────────────────────────────────
const versions = {};
for (const rel of MANIFESTS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  versions[rel] = JSON.parse(fs.readFileSync(file, 'utf8')).version;
}
const distinct = [...new Set(Object.values(versions))];
if (distinct.length > 1) {
  note(
    `manifests disagree on the version:\n` +
      Object.entries(versions).map(([f, v]) => `      ${v.padEnd(10)} ${f}`).join('\n'),
  );
}
const current = distinct[0];

// ── 2–3. changelog is unique and ordered ─────────────────────────────────────
const changelogPath = path.join(ROOT, 'CHANGELOG.md');
let newestReleased = null;

if (fs.existsSync(changelogPath)) {
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const listed = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);

  const seen = new Set();
  const dupes = new Set();
  for (const v of listed) (seen.has(v) ? dupes : seen).add(v);
  if (dupes.size) {
    note(`CHANGELOG.md lists these versions more than once: ${[...dupes].join(', ')}`);
  }

  const asNums = (v) => v.split('.').map(Number);
  const descending = (a, b) => {
    const [x, y] = [asNums(a), asNums(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  for (let i = 0; i < listed.length - 1; i++) {
    if (!descending(listed[i], listed[i + 1])) {
      note(
        `CHANGELOG.md is out of order: ${listed[i]} is listed above ${listed[i + 1]}. ` +
          `Entries must run newest to oldest — a release that reuses or goes below an ` +
          `earlier number is how 1.3.0 shipped twice.`,
      );
      break;
    }
  }

  newestReleased = listed[0] ?? null;

  // ── 4. manifest is not behind the changelog ────────────────────────────────
  if (current && newestReleased) {
    const [c, n] = [asNums(current), asNums(newestReleased)];
    let behind = false;
    for (let i = 0; i < 3; i++) {
      if (c[i] !== n[i]) { behind = c[i] < n[i]; break; }
    }
    if (behind) {
      note(`manifests say ${current} but CHANGELOG.md's newest release is ${newestReleased}`);
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error('\n✗ Version consistency check failed:\n');
  problems.forEach((p) => console.error(`  • ${p}\n`));
  process.exit(1);
}

console.log(
  `✓ Version consistency: all manifests at ${current}` +
    (newestReleased ? `, changelog newest release ${newestReleased}, no duplicates, ordered` : ''),
);
