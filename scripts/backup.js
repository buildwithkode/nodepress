#!/usr/bin/env node
/**
 * Backup and restore for a NodePress install — database + local uploads.
 *
 *   npm run backup                          → backups/nodepress-<timestamp>.tar.gz
 *   npm run backup -- --out /mnt/backups    → choose the folder
 *   npm run restore -- backups/nodepress-….tar.gz [--yes] [--force]
 *
 * A backup archive holds:
 *   db.dump        pg_dump custom-format dump (schema + data, no owners/grants)
 *   uploads/       backend/uploads when STORAGE_DRIVER is local (S3 media is not
 *                  copied — back the bucket up with your provider's tooling)
 *   manifest.json  NodePress version, time, applied migrations, what's included
 *
 * The database is read from the environment first, then backend/.env:
 * DIRECT_URL is preferred over DATABASE_URL, because a transaction-mode pooler
 * (Supabase/pgbouncer on :6543) cannot run pg_dump/pg_restore.
 *
 * Restore safety:
 *   - prints the target host/database and asks you to type the database name
 *     (skip with --yes for scripts)
 *   - refuses a database that already has users unless --force
 *   - refuses a backup from a newer NodePress version, or one containing
 *     migrations this code doesn't have, unless --force
 *   - restores in a single transaction (all or nothing), then runs
 *     `prisma migrate deploy` so an older backup is brought up to date
 *
 * Archives contain password hashes, API keys and webhook secrets: they are
 * written with mode 0600. Store them somewhere private.
 *
 * Requires the PostgreSQL client tools (pg_dump, pg_restore, psql) and tar.
 * Environment overrides: UPLOADS_DIR (default backend/uploads).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(BACKEND, 'uploads');
const MIGRATIONS_DIR = path.join(BACKEND, 'prisma', 'migrations');

// Prisma-only connection-string parameters that libpq (pg_dump/psql) rejects.
const PRISMA_ONLY_PARAMS = [
  'schema', 'pgbouncer', 'connection_limit', 'pool_timeout', 'socket_timeout',
  'statement_cache_size', 'sslaccept', 'sslidentity', 'sslpassword',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readEnvFile() {
  const envPath = path.join(BACKEND, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const fileEnv = readEnvFile();
const setting = (key) => process.env[key] ?? fileEnv[key];

/**
 * DATABASE_URL and DIRECT_URL always come from ONE source: the environment if
 * either is set there, otherwise backend/.env. Mixing them would let
 * `DATABASE_URL=<test db> npm run restore` pick up DIRECT_URL from .env and
 * restore into the real database instead.
 */
function databaseUrls() {
  const fromEnv = process.env.DATABASE_URL !== undefined || process.env.DIRECT_URL !== undefined;
  const src = fromEnv ? process.env : fileEnv;
  return { databaseUrl: src.DATABASE_URL, directUrl: src.DIRECT_URL };
}

/** libpq-compatible URL (Prisma params removed) plus the Prisma `schema`, if any. */
function databaseTarget() {
  const { databaseUrl, directUrl } = databaseUrls();
  const raw = directUrl || databaseUrl;
  if (!raw) die('No DIRECT_URL or DATABASE_URL in the environment or backend/.env');
  let url;
  try {
    url = new URL(raw);
  } catch {
    die('DATABASE_URL is not a valid URL');
  }
  const schema = url.searchParams.get('schema');
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  return {
    url: url.toString(),
    host: url.hostname,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    schema: schema && schema !== 'public' ? schema : null,
  };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error && r.error.code === 'ENOENT') {
    die(`"${cmd}" not found — install the PostgreSQL client tools (pg_dump, pg_restore, psql) and tar`);
  }
  return r;
}

function mustRun(cmd, args, what, opts) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) die(`${what} failed:\n${(r.stderr || r.stdout || '').trim()}`);
  return r.stdout;
}

/** Run one SQL query with psql; returns trimmed output, or null if it errors. */
function psql(target, sql) {
  const r = run('psql', ['--no-psqlrc', '-Atq', '-v', 'ON_ERROR_STOP=1', '-d', target.url, '-c', sql]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function appliedMigrations(target) {
  const out = psql(target, 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1');
  return out === null ? null : out.split('\n').filter(Boolean);
}

function codeMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

// The NodePress release: nodepress.json in a scaffolded project (its own
// package.json carries the project's version), else the root package.json.
const version = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'nodepress.json'), 'utf8')).version || require(path.join(ROOT, 'package.json')).version; }
  catch { return require(path.join(ROOT, 'package.json')).version; }
};

/** -1 / 0 / 1 for dotted numeric versions. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.gitkeep') continue;
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}

// ── backup ───────────────────────────────────────────────────────────────────

function backup(args) {
  const outIdx = args.indexOf('--out');
  const outDir = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(ROOT, 'backups'));
  const target = databaseTarget();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepress-backup-'));

  try {
    console.log(`• Dumping database "${target.database}" on ${target.host}:${target.port}…`);
    mustRun('pg_dump', [
      '--format=custom', '--no-owner', '--no-privileges',
      ...(target.schema ? ['--schema', target.schema] : []),
      '--file', path.join(stage, 'db.dump'),
      '--dbname', target.url,
    ], 'pg_dump');

    const storage = (setting('STORAGE_DRIVER') || 'local').toLowerCase();
    let uploads = 0;
    if (storage !== 's3' && fs.existsSync(UPLOADS_DIR)) {
      uploads = countFiles(UPLOADS_DIR);
      if (uploads > 0) {
        console.log(`• Copying ${uploads} uploaded file(s)…`);
        fs.cpSync(UPLOADS_DIR, path.join(stage, 'uploads'), {
          recursive: true,
          filter: (src) => path.basename(src) !== '.gitkeep',
        });
      }
    }

    const manifest = {
      format: 1,
      nodepressVersion: version(),
      createdAt: new Date().toISOString(),
      database: { host: target.host, name: target.database, schema: target.schema || 'public' },
      migrations: appliedMigrations(target), // null: database built without migrations
      storageDriver: storage,
      uploads,
    };
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `nodepress-${stamp}.tar.gz`);
    mustRun('tar', ['-czf', file, '-C', stage, '.'], 'tar');
    fs.chmodSync(file, 0o600);

    console.log(`✓ Backup written: ${path.relative(process.cwd(), file) || file} (${humanSize(fs.statSync(file).size)})`);
    if (storage === 's3') console.log('  Media is on S3 and is not included — back up the bucket separately.');
    console.log('  It contains password hashes, API keys and webhook secrets — keep it private.');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ── restore ──────────────────────────────────────────────────────────────────

async function restore(args) {
  const file = args.find((a) => !a.startsWith('--'));
  const yes = args.includes('--yes');
  const force = args.includes('--force');
  if (!file) die('Usage: npm run restore -- <backup.tar.gz> [--yes] [--force]');
  if (!fs.existsSync(file)) die(`No such file: ${file}`);

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nodepress-restore-'));
  try {
    mustRun('tar', ['-xzf', file, '-C', stage], 'Reading the archive');
    const manifestPath = path.join(stage, 'manifest.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(path.join(stage, 'db.dump'))) {
      die('Not a NodePress backup (manifest.json or db.dump missing)');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const target = databaseTarget();

    console.log(`Backup:  NodePress ${manifest.nodepressVersion}, taken ${manifest.createdAt}`);
    console.log(`         from "${manifest.database?.name}" on ${manifest.database?.host}; ${manifest.uploads || 0} uploaded file(s)`);
    console.log(`Target:  "${target.database}" on ${target.host}:${target.port}`);

    // Compatibility: never load data into code that's older than the backup.
    const problems = [];
    if (compareVersions(manifest.nodepressVersion, version()) > 0) {
      problems.push(`the backup is from NodePress ${manifest.nodepressVersion}, newer than this code (${version()}) — upgrade first`);
    }
    if (Array.isArray(manifest.migrations)) {
      const known = new Set(codeMigrations());
      const unknown = manifest.migrations.filter((m) => !known.has(m));
      if (unknown.length) problems.push(`the backup has migrations this code doesn't: ${unknown.join(', ')}`);
    }

    // Overwrite protection.
    const users = psql(target, 'SELECT count(*) FROM users');
    if (users !== null && Number(users) > 0) {
      problems.push(`the target database already has ${users} user(s) — restoring replaces all of its data`);
    }

    if (problems.length) {
      for (const p of problems) console.log(`! ${p}`);
      if (!force) die('Refusing to restore. Re-run with --force to override.');
      console.log('  --force given: continuing anyway.');
    }

    if (!yes) {
      const typed = await ask(`Type the target database name ("${target.database}") to restore into it: `);
      if (typed !== target.database) die('Name did not match — nothing was changed.');
    }

    console.log('• Restoring database (single transaction)…');
    mustRun('pg_restore', [
      '--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error',
      '--dbname', target.url,
      path.join(stage, 'db.dump'),
    ], 'pg_restore');

    const stagedUploads = path.join(stage, 'uploads');
    if (fs.existsSync(stagedUploads)) {
      console.log(`• Restoring uploads into ${path.relative(process.cwd(), UPLOADS_DIR) || UPLOADS_DIR}…`);
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.cpSync(stagedUploads, UPLOADS_DIR, { recursive: true });
    }

    if (Array.isArray(manifest.migrations)) {
      console.log('• Applying newer migrations (prisma migrate deploy)…');
      mustRun('npx', ['prisma', 'migrate', 'deploy'], 'prisma migrate deploy', {
        cwd: BACKEND,
        env: (() => {
          const { databaseUrl, directUrl } = databaseUrls();
          return { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl || databaseUrl };
        })(),
      });
    } else {
      console.log('  This database was built without migrations (prisma db push); apply new migration SQL by hand.');
    }

    console.log('✓ Restore complete. Restart the backend so caches start fresh.');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'restore') {
  restore(rest).catch((err) => die(err.message));
} else if (!cmd || cmd === 'backup' || cmd.startsWith('--')) {
  backup(cmd === 'backup' ? rest : process.argv.slice(2));
} else {
  die(`Unknown command "${cmd}". Use: backup.js [--out <dir>] | backup.js restore <file> [--yes] [--force]`);
}
