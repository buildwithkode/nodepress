#!/usr/bin/env node
/**
 * Pre-flight database reachability check, run automatically by `npm run dev`
 * via the `predev` script.
 *
 * Why this exists:
 *   When PostgreSQL is not running, the backend fails to connect and exits.
 *   `concurrently` then keeps the frontend up, and every request it proxies to
 *   the backend fails with a bare `AggregateError [ECONNREFUSED] ... port 3000`.
 *   That error names the *frontend's* port and says nothing about Postgres, so
 *   the first thing you touch — usually the login form — appears broken
 *   instead. This turns that into one actionable line, before anything starts.
 *
 * This only checks that something is listening on the database host/port. The
 * backend's PrismaService performs the deeper check (right server, schema
 * actually present) once it connects — see backend/src/prisma/prisma.service.ts.
 *
 * Set SKIP_DB_CHECK=1 to bypass (e.g. when the DB lives somewhere this script
 * cannot reach, or you deliberately want the frontend alone).
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 2000;
const DEFAULT = { host: 'localhost', port: 5432 };

/** Pull DATABASE_URL from the environment, falling back to backend/.env. */
function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(__dirname, '..', 'backend', '.env');
  if (!fs.existsSync(envPath)) return null;

  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  return match ? match[1] : null;
}

/** Host/port from DATABASE_URL, or the Postgres defaults if it is absent/unparseable. */
function resolveTarget() {
  const url = readDatabaseUrl();
  if (!url) return { ...DEFAULT, source: 'default' };

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || DEFAULT.host,
      port: Number(parsed.port) || DEFAULT.port,
      database: parsed.pathname.replace(/^\//, '') || undefined,
      source: 'DATABASE_URL',
    };
  } catch {
    return { ...DEFAULT, source: 'default' };
  }
}

function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function startHint() {
  if (process.platform === 'darwin') {
    return [
      '  EDB installer:  sudo launchctl kickstart -k system/postgresql-18',
      '  Homebrew:       brew services start postgresql@16',
      '  Docker:         npm run docker:dev',
    ];
  }
  if (process.platform === 'linux') {
    return [
      '  systemd:        sudo systemctl start postgresql',
      '  Docker:         npm run docker:dev',
    ];
  }
  return ['  Docker:         npm run docker:dev'];
}

(async () => {
  if (process.env.SKIP_DB_CHECK === '1') return;

  const target = resolveTarget();

  if (await canConnect(target)) {
    const where = target.database ? `${target.host}:${target.port}/${target.database}` : `${target.host}:${target.port}`;
    console.log(`✓ PostgreSQL reachable at ${where}`);
    return;
  }

  const note =
    target.source === 'DATABASE_URL'
      ? 'from DATABASE_URL'
      : 'no DATABASE_URL found — checked the default';

  console.error(
    [
      '',
      `✗ PostgreSQL is not reachable at ${target.host}:${target.port} (${note}).`,
      '',
      '  Nothing is listening there, so the backend cannot start. If you continue,',
      '  the frontend will run alone and every request to it fails with',
      '  ECONNREFUSED on port 3000 — which looks like a broken login page.',
      '',
      '  Start your database, then re-run `npm run dev`:',
      '',
      ...startHint(),
      '',
      '  Already running elsewhere? Point DATABASE_URL at it, or set',
      '  SKIP_DB_CHECK=1 to bypass this check.',
      '',
    ].join('\n'),
  );
  process.exit(1);
})();
