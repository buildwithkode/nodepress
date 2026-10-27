'use strict';

// Shared by the scaffold (src/new.js) and `upgrade` (src/upgrade.js): which
// release to use, and which paths a project doesn't carry.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// NODEPRESS_REPO points both commands at another clone (a fork, or a local
// path when testing).
const REPO_URL = process.env.NODEPRESS_REPO || 'https://github.com/buildwithkode/nodepress.git';

/** Records the release a project is on — written by the scaffold, updated by `upgrade`. */
const PROJECT_FILE = 'nodepress.json';

// Removed from every new project. `upgrade` skips them too.
const DEV_ONLY = [
  '.claude',              // Claude Code AI config
  'CLAUDE.md',            // Claude Code instructions
  'cli',                  // The CLI tool itself
  'specs',                // Internal architecture specifications
  'scripts/check-docker-lockfiles.sh', // Internal pre-push checks…
  'scripts/check-i18n.js',
  'scripts/check-install-scripts.js',
  'scripts/check-licenses.js',
  'scripts/check-versions.js',
  'scripts/validate.sh',
  'scripts/install.sh',   // One-line server installer (runs from the NodePress repo)
  'docs',                 // NodePress GitHub Pages site
  'CHANGELOG.md',         // NodePress version history
  'CODE_OF_CONDUCT.md',   // NodePress open source conduct file
  'CONTRIBUTING.md',      // NodePress contributor guide
  '.githooks',            // Internal pre-push & commit githooks
  '.github',              // NodePress CI/CD workflows and issue templates
  '.vercelignore',        // Vercel config for the NodePress docs site
  'backend/test',         // Internal E2E integration test suites
  'backend/scripts/brutal-plugin-test.ts',    // Internal plugin & launch test scripts
  'backend/scripts/test-e2e-launch-flow.ts',  // (reset-admin-password.ts stays)
  'backend/scripts/test-plugin-e2e.ts',
  'package-lock.json',    // Root lockfile (regenerated for the fresh root package.json)
  'node_modules',
];

// Removed unless the project is scaffolded with --docker.
const DOCKER_ONLY = [
  'docker-compose.yml',
  'docker-compose.prod.yml',
  'nginx',         // reverse-proxy config (Docker production only)
  'monitoring',    // Prometheus/Grafana stack (Docker only)
  'scripts/docker-secrets-init.sh',  // mounted by docker-compose.yml
  'scripts/backup.sh',               // mounted by docker-compose.prod.yml
  'scripts/backup-crontab',
];

// Before 1.7.2 the whole of `scripts/` and `backend/scripts/` was removed, which
// took the Docker, backup and password-reset scripts with it. A project whose
// nodepress.json still skips them gets the current list instead.
const LEGACY_SKIP = ['scripts', 'backend/scripts'];

// Removed (or, for report-error.ts, replaced) unless scaffolded with --sentry.
const SENTRY_FILES = [
  'frontend/sentry.server.config.ts',
  'frontend/sentry.client.config.ts',
  'frontend/sentry.edge.config.ts',
];
const SENTRY_REPORTER = 'frontend/lib/report-error.ts';

/** Paths `upgrade` leaves alone in a project scaffolded with these options. */
function skipList({ docker, sentry }) {
  return [
    ...DEV_ONLY.filter((p) => p !== 'node_modules'),
    'package.json',   // the scaffold writes its own root package.json
    ...(docker ? [] : DOCKER_ONLY),
    ...(sentry ? [] : [...SENTRY_FILES, SENTRY_REPORTER]),
  ];
}

/** The skip list for a project without nodepress.json, guessed from its files. */
function defaultSkip(root) {
  return skipList({
    docker: fs.existsSync(path.join(root, 'docker-compose.yml')),
    sentry: fs.existsSync(path.join(root, SENTRY_FILES[0])),
  });
}

/** A project's recorded skip list, with the pre-1.7.2 entries replaced. */
function currentSkip(skip, root) {
  if (!skip) return defaultSkip(root);
  if (!LEGACY_SKIP.some((p) => skip.includes(p))) return skip;
  return [...new Set([...skip.filter((p) => !LEGACY_SKIP.includes(p)), ...defaultSkip(root)])];
}

/** Files a project should carry that the pre-1.7.2 scaffold removed. */
function legacyRemovedFiles({ docker }) {
  return [
    'scripts/backup.js',
    'scripts/check-db.js',
    'backend/scripts/reset-admin-password.ts',
    ...(docker ? ['scripts/docker-secrets-init.sh', 'scripts/backup.sh', 'scripts/backup-crontab'] : []),
  ];
}

const toTag = (v) => (String(v).startsWith('v') ? String(v) : `v${v}`);

/** -1 / 0 / 1 for vX.Y.Z (the leading v is optional). */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** The newest vX.Y.Z tag of a remote (name or URL), or null. Pre-releases are ignored. */
function latestRelease(remote) {
  const r = spawnSync('git', ['ls-remote', '--tags', '--refs', remote], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const tags = r.stdout
    .split('\n')
    .map((line) => line.split('refs/tags/')[1])
    .filter((t) => t && /^v\d+\.\d+\.\d+$/.test(t))
    .sort(compareVersions);
  return tags.length ? tags[tags.length - 1] : null;
}

module.exports = {
  REPO_URL, PROJECT_FILE, DEV_ONLY, DOCKER_ONLY, SENTRY_FILES, SENTRY_REPORTER,
  LEGACY_SKIP, skipList, defaultSkip, currentSkip, legacyRemovedFiles, toTag, compareVersions, latestRelease,
};
