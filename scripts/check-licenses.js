#!/usr/bin/env node
/**
 * Licence gate for production dependencies (pre-push + CI).
 *
 * NodePress is MIT and EcommPress is sold commercially, so nothing that ships
 * may carry a licence that would force either to be open-sourced, restrict use,
 * or is simply unknown. Dev-only tools are not shipped and are ignored.
 *
 *   permissive (MIT, ISC, BSD, Apache-2.0, …)   → OK
 *   weak copyleft (LGPL, MPL, EPL, CDDL)          → OK (used as separate libraries)
 *   strong copyleft (GPL, AGPL, SSPL, …)          → FAIL
 *   source-available / unknown / missing          → FAIL unless reviewed below
 *
 * Usage: node scripts/check-licenses.js   (exit 1 on a problem)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Reviewed exceptions — package name → why it's acceptable. Keep this list short
 * and re-review when a package changes licence.
 */
const REVIEWED = {
  // libvips native binaries behind `sharp` (Apache-2.0). LGPL-3.0: a separate,
  // replaceable shared library loaded at runtime — no effect on our licence.
  '@img/sharp-libvips-': 'LGPL-3.0 native library used by sharp',
  // Functional Source License: only restricts building a Sentry competitor; each
  // release becomes MIT after two years. Build-time source-map upload tool
  // (plus its per-platform binaries, @sentry/cli-darwin, -linux-x64, …).
  '@sentry/cli': 'FSL-1.1-MIT, build-time tool of optional @sentry/nextjs',
  '@sentry/cli-': 'FSL-1.1-MIT, platform binary of @sentry/cli',
  // From passport; MIT per its README, the package.json just has no field.
  pause: 'MIT (stated in README, no package.json field)',
};

const PERMISSIVE = /^(MIT|MIT-0|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|BSD|Apache-2\.0|Unlicense|CC0-1\.0|CC-BY-3\.0|CC-BY-4\.0|BlueOak-1\.0\.0|Python-2\.0|PSF-2\.0|Zlib|WTFPL)$/i;
const WEAK_COPYLEFT = /^(LGPL|MPL|EPL|CDDL)/i;
const STRONG_COPYLEFT = /^(GPL|AGPL|SSPL|EUPL|OSL|CC-BY-SA|CC-BY-NC|BUSL|Elastic)/i;

/** Simplified SPDX evaluation: OR = pick the best option, AND = the worst part decides. */
function classify(expr) {
  if (!expr) return 'missing';
  const clean = String(expr).replace(/[()]/g, ' ').trim();
  const rank = { permissive: 0, weak: 1, unknown: 2, strong: 3 };
  const one = (id) => {
    const t = id.trim().replace(/\+$/, '').replace(/-(only|or-later)$/i, '');
    if (PERMISSIVE.test(t)) return 'permissive';
    if (WEAK_COPYLEFT.test(t)) return 'weak';
    if (STRONG_COPYLEFT.test(t)) return 'strong';
    return 'unknown';
  };
  const orParts = clean.split(/\s+OR\s+/i).map((andGroup) =>
    andGroup.split(/\s+AND\s+/i).map(one).reduce((a, b) => (rank[a] >= rank[b] ? a : b)),
  );
  return orParts.reduce((a, b) => (rank[a] <= rank[b] ? a : b));
}

/** The package.json licence, or — when that field is missing — one read from its LICENSE file. */
function licenseOf(p) {
  const declared = (typeof p.license === 'object' ? p.license?.type : p.license) || null;
  if (declared) return declared;
  try {
    const file = fs.readdirSync(p.path).find((n) => /^(licen[cs]e|copying)/i.test(n));
    if (!file) return null;
    const text = fs.readFileSync(path.join(p.path, file), 'utf8').slice(0, 3000);
    if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
    if (/Apache License,? Version 2\.0/i.test(text)) return 'Apache-2.0';
    if (/Permission to use, copy, modify, and\/or distribute/i.test(text)) return 'ISC';
  } catch { /* unreadable → treated as missing */ }
  return null;
}
const reviewed = (name) => Object.entries(REVIEWED).find(([k]) => (k.endsWith('-') ? name.startsWith(k) : name === k));

const raw = execFileSync('npm', ['query', ':not(.dev)', '--json'], { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString();
const seen = new Map();
for (const p of JSON.parse(raw)) {
  if (!p.name || !p.location || p.location === '' || p.location === '.' ) continue;
  if (!p.location.includes('node_modules')) continue; // workspace packages themselves
  seen.set(`${p.name}@${p.version}`, p);
}

const problems = [];
let allowed = 0;
for (const p of seen.values()) {
  const lic = licenseOf(p);
  const cls = classify(lic);
  if (cls === 'permissive' || cls === 'weak') continue;
  const ok = reviewed(p.name);
  if (ok) { allowed++; continue; }
  problems.push(`${p.name}@${p.version}  licence: ${lic ?? '(none)'}  [${cls}]  at ${p.location}`);
}

if (problems.length) {
  console.error(`✗ Licence check: ${problems.length} production dependenc${problems.length === 1 ? 'y needs' : 'ies need'} review:`);
  for (const line of problems) console.error(`    ${line}`);
  console.error('  Remove or replace the package, or — after checking its terms — add it to REVIEWED in scripts/check-licenses.js with the reason.');
  process.exit(1);
}
console.log(`✓ Licence check: ${seen.size} production packages — permissive or weak copyleft${allowed ? `, ${allowed} reviewed exception(s)` : ''}`);
