// Copyright (c) 2026-present BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * First-run setup page for the server zip. server.js starts it when the data
 * folder has no .env: a small page (no framework, no build) that asks for the
 * PostgreSQL connection and the site address, tests the connection, writes
 * .env with fresh secrets, creates the tables (`prisma migrate deploy`), and
 * then hands over to NodePress on the same port, where /setup creates the
 * first admin as usual.
 *
 * Security:
 *   - every request needs the one-time code printed in the server log, so a
 *     stranger who finds a fresh install first can't claim it; 10 wrong codes
 *     lock the page until a restart (which prints a new code);
 *   - it only runs while .env is missing — once written, server.js never
 *     starts it again;
 *   - .env is written with mode 0600, and only after the tables were created
 *     (a failed setup leaves nothing behind and can simply be retried).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { createRequire } = require('module');

const MAX_WRONG_CODES = 10;
const MIN_POSTGRES_MAJOR = 12; // generated columns (entries.search_vector)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

function oneTimeCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function codeMatches(given, expected) {
  const a = Buffer.from(normalizeCode(given));
  const b = Buffer.from(normalizeCode(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** postgresql:// URL from the form: a pasted connection string, or the separate fields. */
function databaseUrl(db) {
  if (!db || typeof db !== 'object') throw new UserError('Enter the database details.');
  if (db.mode === 'url') {
    const url = String(db.url || '').trim();
    if (!/^postgres(ql)?:\/\/[^\s]+$/.test(url)) {
      throw new UserError('The connection string must start with postgresql:// (MySQL and other databases won\'t work).');
    }
    return url;
  }
  const host = String(db.host || '').trim();
  const name = String(db.name || '').trim();
  const user = String(db.user || '').trim();
  const port = Number(db.port || 5432);
  if (!host || !name || !user) throw new UserError('Fill in the host, database name and user.');
  if (!/^[A-Za-z0-9.\-_]+$/.test(host)) throw new UserError('The host should be a name like db.example.com or an IP address.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UserError('The port must be a number, usually 5432.');
  const enc = encodeURIComponent;
  const auth = db.password ? `${enc(user)}:${enc(String(db.password))}` : enc(user);
  return `postgresql://${auth}@${host}:${port}/${enc(name)}${db.ssl ? '?sslmode=require' : ''}`;
}

function siteUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new UserError('Enter the full site address, like https://cms.example.com');
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new UserError('Enter just the address, like https://cms.example.com (no path after it).');
  }
  return url.origin;
}

class UserError extends Error {}

/** Plain-language reasons for Prisma's connection error codes. */
function connectionError(err) {
  const reasons = {
    P1000: 'The user name or password was rejected.',
    P1001: "Can't reach the database server. Check the host and port, and that it accepts connections from this server.",
    P1002: 'The database server took too long to answer.',
    P1003: "That database doesn't exist. Create it first, or check the name.",
    P1010: "This user isn't allowed to use that database.",
    P1011: 'The secure (SSL) connection failed. Try switching "Requires SSL" on or off.',
    P1013: 'The connection string is not valid.',
  };
  const reason = reasons[err && (err.errorCode || err.code)];
  if (reason) return new UserError(reason);
  const first = String((err && err.message) || err).split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return new UserError(`Couldn't connect: ${first}`);
}

function backendRequire(root) {
  return createRequire(path.join(root, 'backend', 'package.json'));
}

/**
 * Loading the Prisma client copies any backend/.env it finds into process.env
 * (keys not already set). Setup must leave the environment as it found it, or
 * NodePress would start on that file's database instead of the one just set up.
 */
async function withCleanEnv(fn) {
  const before = new Set(Object.keys(process.env));
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(process.env)) if (!before.has(key)) delete process.env[key];
  }
}

/** Connects and checks the server version and that the database is empty or already NodePress. */
function testDatabase(root, url) {
  return withCleanEnv(() => connectAndCheck(root, url));
}

async function connectAndCheck(root, url) {
  const { PrismaClient } = backendRequire(root)('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    let version, tables;
    try {
      [{ version }] = await prisma.$queryRawUnsafe("SELECT current_setting('server_version') AS version");
      tables = await prisma.$queryRawUnsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'",
      );
    } catch (err) {
      throw connectionError(err);
    }
    const major = parseInt(version, 10);
    if (major < MIN_POSTGRES_MAJOR) {
      throw new UserError(`This is PostgreSQL ${version}. NodePress needs ${MIN_POSTGRES_MAJOR} or newer (16 recommended).`);
    }
    const names = tables.map((t) => t.table_name);
    const nodepress = names.includes('_prisma_migrations');
    if (names.length && !nodepress) {
      throw new UserError(
        `This database already has other tables (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}). Use an empty database for NodePress.`,
      );
    }
    return { version, existing: nodepress };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

/** `prisma migrate deploy` with the given database. Returns { ok, output }. */
function migrate(root, url) {
  const cli = backendRequire(root).resolve('prisma/build/index.js');
  // Some unzip tools (and hosting file managers) drop the executable bit, which
  // Prisma's schema engine needs.
  const engines = path.dirname(backendRequire(root).resolve('@prisma/engines/package.json'));
  for (const file of fs.readdirSync(engines)) {
    if (file.startsWith('schema-engine-')) {
      try { fs.chmodSync(path.join(engines, file), 0o755); } catch { /* not ours to change — Prisma reports it */ }
    }
  }
  const schema = path.join(root, 'backend', 'prisma', 'schema.prisma');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: 'utf8',
  });
  return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}

function envFile({ url, site, port }) {
  for (const v of [url, site]) {
    if (/["\n\r\\]/.test(v)) throw new UserError('The details contain a character NodePress can\'t store (", \\ or a line break).');
  }
  return [
    `# Written by the NodePress setup page on ${new Date().toISOString()}.`,
    '# Every setting is explained in backend/.env.example. Keep this file private:',
    '# JWT_SECRET signs logins and encrypts the passwords saved in the admin.',
    'NODE_ENV=production',
    `PORT=${port}`,
    `DATABASE_URL="${url}"`,
    `DIRECT_URL="${url}"`,
    `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    `APP_URL=${site}`,
    `SITE_URL=${site}`,
    `CORS_ORIGIN=${site}`,
    '',
  ].join('\n');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return reject(new UserError('Expected JSON.'));
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new UserError('Too much data.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new UserError('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

/**
 * Serves the setup page on `port` until NodePress is set up, then resolves
 * (with the listener closed) so server.js can start NodePress on the same port.
 */
function runSetup({ root, data, port }) {
  const code = oneTimeCode();
  const target = path.join(data, '.env');
  // Also in a file, for hosts where the log is hard to reach (cPanel's File
  // Manager can open it). Removed once NodePress is set up.
  const codeFile = path.join(data, 'setup-code.txt');
  fs.writeFileSync(codeFile, `${code}\n`, { mode: 0o600 });
  let wrong = 0;
  let busy = false;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://setup');
      try {
        if (url.pathname === '/api/health') return send(res, 503, { status: 'setup' });

        if (req.method === 'GET') {
          if (url.pathname !== '/' && url.pathname !== '/install') {
            res.writeHead(302, { Location: '/install' });
            return res.end();
          }
          return send(res, 200, page(req), 'text/html; charset=utf-8');
        }

        if (req.method !== 'POST' || !['/install/test', '/install'].includes(url.pathname)) {
          return send(res, 404, { message: 'Not found' });
        }
        if (wrong >= MAX_WRONG_CODES) {
          return send(res, 429, { message: 'Too many wrong codes. Restart NodePress to get a new code.' });
        }
        const body = await readJson(req);
        if (!codeMatches(body.code, code)) {
          wrong++;
          if (wrong >= MAX_WRONG_CODES) console.error('⚠ Setup page locked after too many wrong codes — restart NodePress for a new code.');
          return send(res, 403, { message: "That code isn't right. It's printed in NodePress's log and saved in setup-code.txt in its data folder." });
        }
        if (busy) return send(res, 409, { message: 'Setup is already running — wait a moment.' });

        busy = true;
        try {
          const dbUrl = databaseUrl(body.db);
          const db = await testDatabase(root, dbUrl);
          if (url.pathname === '/install/test') return send(res, 200, { ok: true, ...db });

          const site = siteUrl(body.siteUrl);
          const content = envFile({ url: dbUrl, site, port });
          const result = migrate(root, dbUrl);
          if (!result.ok) {
            console.error(result.output);
            return send(res, 500, { message: "The database tables couldn't be created. The details are in NodePress's log." });
          }
          const pending = `${target}.pending`;
          fs.writeFileSync(pending, content, { mode: 0o600 });
          fs.renameSync(pending, target);
          console.log(`✔ Settings saved to ${target}`);
          fs.rmSync(codeFile, { force: true });
          send(res, 200, { ok: true });
          // Hand over to NodePress once the response is out.
          setImmediate(() => {
            server.close(() => resolve());
            server.closeAllConnections();
          });
        } finally {
          busy = false;
        }
      } catch (err) {
        if (err instanceof UserError) return send(res, 400, { message: err.message });
        console.error(err);
        send(res, 500, { message: "Something went wrong. The details are in NodePress's log." });
      }
    });

    server.on('error', reject);
    server.listen(port, () => {
      const line = '─'.repeat(54);
      console.log(`\n${line}\n  NodePress isn't set up yet.\n\n  Open your site in a browser and enter this code:\n\n      ${code}\n\n  It's also in ${codeFile}\n  (Local test: http://localhost:${port}/install)\n${line}\n`);
    });
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The site address as the browser sees it, to pre-fill the form. */
function guessSite(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto === 'https' ? 'https' : 'http'}://${host}` : '';
}

function page(req) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Set up NodePress</title>
<style>
  :root { --bg:#f5f6f8; --card:#fff; --fg:#161a22; --muted:#5d6574; --line:#d9dde4; --accent:#4f5bd5; --bad:#b42318; --good:#1d7a46; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg:#101318; --card:#181c23; --fg:#e7eaf0; --muted:#9aa3b2; --line:#2a303b; --accent:#8b95ff; --bad:#ff8a80; --good:#6cd39a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 40px 16px 64px; }
  h1 { font-size: 1.7rem; margin: 0 0 6px; }
  h2 { font-size: 1.05rem; margin: 0 0 4px; }
  p { margin: 0; }
  .muted { color: var(--muted); font-size: .94rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-top: 18px; display: grid; gap: 14px; }
  label { display: grid; gap: 5px; font-weight: 600; font-size: .94rem; }
  label small { font-weight: 400; color: var(--muted); }
  input[type=text], input[type=password], input[type=url], input[type=number] { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .row { display: grid; grid-template-columns: 1fr 7rem; gap: 12px; }
  .check { display: flex; gap: 8px; align-items: center; font-weight: 400; }
  .tabs { display: flex; gap: 6px; }
  .tabs button { flex: 1; background: transparent; color: var(--fg); border: 1px solid var(--line); }
  .tabs button[aria-pressed=true] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  button { padding: 11px 16px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  button:disabled { opacity: .6; cursor: progress; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .msg { padding: 10px 12px; border-radius: 8px; border: 1px solid currentColor; font-size: .94rem; }
  .msg.bad { color: var(--bad); } .msg.good { color: var(--good); }
  [hidden] { display: none !important; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: .9em; }
</style>
</head>
<body>
<main>
  <h1>Set up NodePress</h1>
  <p class="muted">Connect a PostgreSQL database and NodePress is ready. This takes about a minute.</p>

  <form id="f" novalidate>
    <div class="card">
      <h2>1. Setup code</h2>
      <p class="muted">Printed in NodePress's log when it started, and saved in <code>setup-code.txt</code> in its data folder (<code>nodepress-data</code>, next to the app folder).</p>
      <label>Code <input type="text" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" required></label>
    </div>

    <div class="card">
      <h2>2. Database</h2>
      <p class="muted">An empty PostgreSQL database: from your hosting panel, or a provider like Supabase or Neon. MySQL won't work.</p>
      <div class="tabs" role="group" aria-label="How to enter the database">
        <button type="button" data-mode="fields" aria-pressed="true">Enter details</button>
        <button type="button" data-mode="url" aria-pressed="false">Paste a connection string</button>
      </div>
      <div id="fields" style="display:grid;gap:14px">
        <div class="row">
          <label>Host <input type="text" name="host" placeholder="localhost" spellcheck="false"></label>
          <label>Port <input type="number" name="port" value="5432" min="1" max="65535"></label>
        </div>
        <label>Database name <input type="text" name="name" placeholder="nodepress" spellcheck="false"></label>
        <label>User <input type="text" name="user" autocomplete="off" spellcheck="false"></label>
        <label>Password <input type="password" name="password" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="ssl"> Requires SSL <small>(on for Supabase, Neon and most hosted databases)</small></label>
      </div>
      <label id="urlField" hidden>Connection string <small>Starts with postgresql://</small>
        <input type="text" name="url" spellcheck="false" placeholder="postgresql://user:password@host:5432/nodepress?sslmode=require">
      </label>
      <div class="actions"><button type="button" class="secondary" id="test">Test connection</button></div>
    </div>

    <div class="card">
      <h2>3. Site address</h2>
      <label>Address <small>Where you'll open NodePress. Use https:// once your domain has a certificate.</small>
        <input type="url" name="siteUrl" value="${esc(guessSite(req))}" spellcheck="false" required>
      </label>
    </div>

    <div class="card">
      <div id="msg" class="msg" role="status" hidden></div>
      <div class="actions"><button type="submit" id="go">Install NodePress</button></div>
    </div>
  </form>
</main>
<script>
  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  let mode = 'fields';
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.getElementById('fields').hidden = mode !== 'fields';
    document.getElementById('urlField').hidden = mode !== 'url';
  }));
  function show(text, kind) {
    msg.textContent = text; msg.className = 'msg ' + kind; msg.hidden = false;
    msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function payload() {
    const v = (n) => f.elements[n].value;
    return {
      code: v('code'),
      siteUrl: v('siteUrl'),
      db: mode === 'url'
        ? { mode: 'url', url: v('url') }
        : { mode: 'fields', host: v('host'), port: v('port'), name: v('name'), user: v('user'), password: v('password'), ssl: f.elements.ssl.checked },
    };
  }
  async function post(path) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Something went wrong.');
    return body;
  }
  function busy(on) { for (const id of ['test', 'go']) document.getElementById(id).disabled = on; }
  document.getElementById('test').addEventListener('click', async () => {
    busy(true); show('Connecting…', 'good');
    try {
      const r = await post('/install/test');
      show('Connected to PostgreSQL ' + r.version + (r.existing ? '. It already has NodePress tables: they will be kept and updated.' : '. The database is empty and ready.'), 'good');
    } catch (e) { show(e.message, 'bad'); }
    busy(false);
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    busy(true); show('Creating the database tables… this can take a minute.', 'good');
    try {
      await post('/install');
      show('Done. Starting NodePress…', 'good');
      const wait = async () => {
        try { const r = await fetch('/api/health', { cache: 'no-store' }); if (r.ok) return location.assign('/setup'); } catch {}
        setTimeout(wait, 1500);
      };
      setTimeout(wait, 1500);
    } catch (err) { show(err.message, 'bad'); busy(false); }
  });
</script>
</body>
</html>`;
}

module.exports = { runSetup, migrate, codeMatches, databaseUrl, siteUrl, oneTimeCode };
