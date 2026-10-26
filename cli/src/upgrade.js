'use strict';

// `npx create-nodepress-app upgrade [version]` — brings a scaffolded project's
// code up to a newer NodePress release.
//
// A scaffolded project has its own git history (unrelated to NodePress) and is
// missing the files the scaffold removed, so a plain `git merge` of the new
// release would conflict on every one of them. Instead this takes the diff
// between the release the project is on and the target release, leaves out the
// paths the project doesn't have, and applies it with `git apply --3way`: the
// user's own edits are kept, and lines both sides changed get conflict markers.
//
// The release the project is on lives in nodepress.json (written by the
// scaffold). Projects made before it existed pass --from <version> once.
//
// Only the code is changed. Installing, migrating and committing stay with the
// user, who is told what to run.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  REPO_URL, PROJECT_FILE, latestRelease, compareVersions, toTag, defaultSkip,
} = require('./release');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', blue: '\x1b[34m',
  yellow: '\x1b[33m', dim: '\x1b[2m',
};
const log = (msg = '') => process.stdout.write(msg + '\n');
const ok = (msg) => log(`  ${c.green}✔${c.reset}  ${msg}`);
const info = (msg) => log(`  ${c.blue}→${c.reset}  ${msg}`);
const warn = (msg) => log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
function fail(msg) { log(`\n  ${c.yellow}✖${c.reset}  ${msg}\n`); process.exit(1); }

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.error) fail(`git failed to start: ${r.error.message}`);
  return r;
}
function gitOut(args, what) {
  const r = git(args);
  if (r.status !== 0) fail(`${what}:\n     ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

/** True when `file` is `p` or inside directory `p`. */
const covers = (p, file) => file === p || file.startsWith(p.replace(/\/$/, '') + '/');

module.exports = function upgrade(args) {
  const dryRun = args.includes('--dry-run');
  const fromFlag = flagValue(args, '--from');
  const target = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--from');

  const root = process.cwd();
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0 || path.resolve(top.stdout.trim()) !== fs.realpathSync(root)) {
    fail('Run this from the root of your NodePress project (a git repository).');
  }
  if (!fs.existsSync(path.join(root, 'backend')) || !fs.existsSync(path.join(root, 'frontend'))) {
    fail('This doesn\'t look like a NodePress project (no backend/ and frontend/ folders).');
  }

  // ── Where the project is now ───────────────────────────────────────────────
  const projectPath = path.join(root, PROJECT_FILE);
  let project = null;
  if (fs.existsSync(projectPath)) {
    try { project = JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch {
      fail(`${PROJECT_FILE} is not valid JSON.`);
    }
  }
  const from = fromFlag || project?.version;
  if (!from) {
    let hint = '';
    try { hint = require(path.join(root, 'backend', 'package.json')).version; } catch { /* none */ }
    fail(
      `No ${PROJECT_FILE} — this project was created before upgrades were tracked.\n` +
      `     Tell it which NodePress release it was created from, once:\n` +
      `       npx create-nodepress-app upgrade --from <version>\n` +
      (hint ? `     backend/package.json says ${c.bold}${hint}${c.reset} — use that unless you upgraded by hand since.` : ''),
    );
  }
  const repo = project?.repository || REPO_URL;

  if (!dryRun && git(['status', '--porcelain']).stdout.trim()) {
    fail('You have uncommitted changes. Commit or stash them first, so the upgrade can be reviewed (and undone) on its own.');
  }

  // ── Where it's going ───────────────────────────────────────────────────────
  if (git(['remote', 'get-url', 'nodepress']).status !== 0) {
    gitOut(['remote', 'add', 'nodepress', repo], 'Could not add the nodepress remote');
    ok(`Added git remote ${c.bold}nodepress${c.reset} → ${repo}`);
  }
  const to = target || latestRelease('nodepress');
  if (!to) fail(`No releases found at ${repo}.`);
  const fromTag = toTag(from);
  const toTagName = toTag(to);
  if (compareVersions(toTagName, fromTag) <= 0) {
    ok(`Already on NodePress ${fromTag} — nothing to upgrade (target ${toTagName}).`);
    return;
  }

  info(`Fetching NodePress ${fromTag} and ${toTagName} …`);
  // Kept under refs/nodepress/ so they can't clash with the project's own tags.
  const refOf = (tag) => `refs/nodepress/${tag}`;
  const fetched = git(['fetch', '--no-tags', 'nodepress',
    `+refs/tags/${fromTag}:${refOf(fromTag)}`, `+refs/tags/${toTagName}:${refOf(toTagName)}`]);
  if (fetched.status !== 0) {
    fail(`Could not fetch ${fromTag} and ${toTagName} — does that release exist?\n     ${fetched.stderr.trim()}`);
  }
  const A = refOf(fromTag);
  const B = refOf(toTagName);

  // ── Decide what applies ────────────────────────────────────────────────────
  const skip = project?.skip || defaultSkip(root);
  const changes = gitOut(['diff', '--no-renames', '--name-status', A, B], 'Could not compare the releases')
    .split('\n').filter(Boolean).map((line) => {
      const [status, file] = line.split('\t');
      return { status: status[0], file };
    });

  const apply = [];
  const skipped = [];   // the scaffold removed or rewrote these
  const missing = [];   // changed upstream, deleted from this project
  const existing = [];  // new upstream, but the project already has a file there
  for (const ch of changes) {
    if (skip.some((p) => covers(p, ch.file))) { skipped.push(ch.file); continue; }
    const here = fs.existsSync(path.join(root, ch.file));
    if (ch.status === 'A' && here) { existing.push(ch.file); continue; }
    if (ch.status !== 'A' && !here) { missing.push(ch.file); continue; }
    apply.push(ch.file);
  }

  const major = (v) => Number(v.replace(/^v/, '').split('.')[0]);
  log('');
  log(`  ${c.bold}NodePress ${fromTag} → ${toTagName}${c.reset}  ${c.dim}${apply.length} file(s) to update${c.reset}`);
  if (major(toTagName) > major(fromTag)) {
    warn(`Major version change — read the "Upgrade notes" of every major release up to ${toTagName} before migrating.`);
  }

  if (dryRun) {
    if (apply.length) {
      log('');
      log(gitOut(['diff', '--stat=100', A, B, '--', ...apply], 'Could not summarize the changes').replace(/^/gm, '    '));
    }
    report();
    log(`  ${c.dim}Dry run — nothing was changed. Run without --dry-run to apply.${c.reset}\n`);
    return;
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  const conflicts = [];
  if (apply.length) {
    const patch = gitOut(['diff', '--binary', '--full-index', '--no-renames', A, B, '--', ...apply], 'Could not build the patch');
    const applied = git(['apply', '--3way', '--whitespace=nowarn'], { input: patch });
    conflicts.push(...gitOut(['diff', '--name-only', '--diff-filter=U'], 'Could not list conflicts').split('\n').filter(Boolean));
    if (applied.status !== 0 && conflicts.length === 0) {
      fail(`The changes could not be applied — nothing was changed.\n     ${applied.stderr.trim().split('\n').join('\n     ')}`);
    }
  }

  const next = { ...(project || {}), version: toTagName.slice(1), ref: toTagName, repository: repo, skip };
  fs.writeFileSync(projectPath, JSON.stringify(next, null, 2) + '\n', 'utf8');

  log('');
  ok(`Applied NodePress ${toTagName}${conflicts.length ? '' : ' — no conflicts'}`);
  if (conflicts.length) {
    warn(`${conflicts.length} file(s) have conflicts (you and NodePress changed the same lines). Fix the <<<<<<< markers, then \`git add\` them:`);
    for (const f of conflicts) log(`       ${f}`);
  }
  report();

  log(`  ${c.bold}Next:${c.reset}`);
  log(`    1. Back up your database (pg_dump) — the next step changes it.`);
  log(`    2. npm install`);
  log(`    3. cd backend && npx prisma migrate deploy && cd ..`);
  log(`    4. Restart, check the admin, then commit:  git add -A && git commit -m "Upgrade NodePress to ${toTagName}"`);
  log(`    ${c.dim}Undo instead: git reset --hard && git clean -fd${c.reset}`);
  log(`    ${c.dim}What changed: https://github.com/buildwithkode/nodepress/blob/${toTagName}/CHANGELOG.md${c.reset}`);
  log('');

  function report() {
    if (changes.some((ch) => ch.file === 'package.json')) {
      log('');
      info(`NodePress's root package.json changed (overrides, allowScripts, scripts). Your project has its own, so compare by hand:`);
      log(`       ${c.dim}git diff ${A} ${B} -- package.json${c.reset}`);
    }
    if (missing.length) {
      log('');
      info(`Not applied — changed in NodePress, but deleted from your project (${missing.length}):`);
      for (const f of missing) log(`       ${f}`);
    }
    if (existing.length) {
      log('');
      info(`Not applied — new in NodePress, but your project already has a file there (${existing.length}). Compare with \`git show ${B}:<file>\`:`);
      for (const f of existing) log(`       ${f}`);
    }
    if (skipped.length) log(`\n  ${c.dim}${skipped.length} changed file(s) skipped — not part of a project (tests, CLI, changelog…).${c.reset}`);
    log('');
  }
};
