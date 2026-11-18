#!/usr/bin/env node
/**
 * Production dependency audit (pre-push).
 *
 * Runs `npm audit --omit=dev` at the repo root (every workspace) and fails on
 * any high or critical advisory, except the reviewed ones below. Moderate and
 * low advisories are reported by npm but don't block.
 *
 * Usage: node scripts/check-audit.js   (exit 1 on a problem)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BLOCKING = new Set(['high', 'critical']);

/**
 * Reviewed advisories — GHSA id → why it can't hurt us. Only add one with no
 * fixed version available, and remove it as soon as a fix lands (the script
 * says when an entry is no longer needed).
 */
const REVIEWED = {
  // picomatch ReDoS (no patched release yet). Reached through @nestjs/graphql
  // (tinyglobby) and @sentry/nextjs (rollup plugins). Both only match glob
  // patterns written in code or config, never text a visitor or editor
  // supplies, so the slow pattern can't be fed from outside.
  'GHSA-fc5q-39xc-vjpf': 'picomatch ReDoS: patterns come from code, never user input',
};

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('[audit] npm audit gave no JSON report:\n' + (run.stderr || run.stdout).slice(0, 2000));
  process.exit(1);
}
if (report.error) {
  console.error('[audit] npm audit failed: ' + (report.error.summary || JSON.stringify(report.error)));
  process.exit(1);
}

// Advisories are the object entries in each vulnerability's `via`; string
// entries just point at another vulnerable package that carries its own.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
  for (const via of vuln.via || []) {
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = String(via.url || '').split('/').pop() || `${pkg}:${via.source}`;
    const a = advisories.get(id) || { id, severity: via.severity, title: via.title, packages: new Set() };
    a.packages.add(pkg);
    advisories.set(id, a);
  }
}

const blocked = [...advisories.values()].filter((a) => !REVIEWED[a.id]);
for (const a of advisories.values()) {
  if (REVIEWED[a.id]) console.log(`[audit] allowed ${a.id} (${a.severity}, ${[...a.packages].join(', ')}): ${REVIEWED[a.id]}`);
}
for (const id of Object.keys(REVIEWED)) {
  if (!advisories.has(id)) console.log(`[audit] note: ${id} no longer reported — remove it from REVIEWED in scripts/check-audit.js`);
}
if (blocked.length) {
  console.error('[audit] high/critical advisories in production dependencies:');
  for (const a of blocked) console.error(`  ${a.id} ${a.severity} — ${a.title} (${[...a.packages].join(', ')})`);
  console.error('Upgrade the dependency, or review it and add it to REVIEWED with the reason.');
  process.exit(1);
}
console.log('[audit] OK — no unreviewed high or critical advisories');
