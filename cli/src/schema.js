'use strict';

/**
 * `schema:pull`, `schema:diff`, `schema:push` — keep the content model in git.
 *
 *   nodepress schema:pull [--out nodepress.schema.json]   write the site's content types to a file
 *   nodepress schema:diff [--file nodepress.schema.json]  what a push would change (exit 1 when anything)
 *   nodepress schema:push [--file nodepress.schema.json] [--yes]
 *
 * Talks to GET /api/content-types/export and POST /api/content-types/import.
 * Connection: NODEPRESS_URL + NODEPRESS_TOKEN (or --url / --token). The token
 * is either an API key with "all" access to every content type (np_…, sent as
 * X-API-Key) or an admin JWT (sent as a Bearer token).
 *
 * Push creates and updates content types; it never deletes one that is only
 * on the server (diff lists those). Exit codes: 0 ok / no changes, 1 changes
 * (diff) or aborted (push), 2 error.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_FILE = 'nodepress.schema.json';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = c(32);
const red = c(31);
const yellow = c(33);
const cyan = c(36);
const dim = c(2);
const bold = c(1);

class CliError extends Error {}

function parseArgs(args) {
  const opts = { yes: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const value = () => {
      if (inline !== undefined) return inline;
      const v = args[++i];
      if (v === undefined || v.startsWith('-')) throw new CliError(`${flag} needs a value`);
      return v;
    };
    if (flag === '--yes' || flag === '-y') opts.yes = true;
    else if (flag === '--out' || flag === '-o') opts.out = value();
    else if (flag === '--file' || flag === '-f') opts.file = value();
    else if (flag === '--url') opts.url = value();
    else if (flag === '--token') opts.token = value();
    else throw new CliError(`Unknown option "${a}"`);
  }
  return opts;
}

function connection(opts) {
  const url = (opts.url || process.env.NODEPRESS_URL || '').replace(/\/+$/, '');
  const token = opts.token || process.env.NODEPRESS_TOKEN || process.env.NODEPRESS_API_KEY || '';
  if (!url) throw new CliError('Set NODEPRESS_URL (or pass --url), e.g. https://cms.example.com');
  if (!token) {
    throw new CliError('Set NODEPRESS_TOKEN (or pass --token): an API key with "all" access to every content type (np_…) or an admin JWT');
  }
  return { url, token };
}

function createClient({ url, token }, fetchImpl = globalThis.fetch) {
  const base = /\/api$/.test(url) ? url : `${url}/api`;
  const auth = token.startsWith('np_') ? { 'X-API-Key': token } : { Authorization: `Bearer ${token}` };
  return async (method, p, body) => {
    let res;
    try {
      res = await fetchImpl(`${base}${p}`, {
        method,
        headers: { Accept: 'application/json', ...auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CliError(`Could not reach ${base}: ${e.cause?.message || e.message}`);
    }
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (!res.ok) {
      const msg = json && typeof json === 'object' ? [].concat(json.message || []).join('; ') : text;
      const extra = json && Array.isArray(json.errors) && json.errors.length ? `\n    ${json.errors.join('\n    ')}` : '';
      throw new CliError(`${method} ${p} → ${res.status}${msg ? `: ${msg}` : ''}${extra}`);
    }
    return json;
  };
}

// ─── Bundle normalization (clean git diffs) ────────────────────────────────

const FIRST_KEYS = ['name', 'label', 'type'];

/** Objects get a fixed key order (name/label/type first, then alphabetical); arrays keep theirs. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value).sort((a, b) => {
    const ia = FIRST_KEYS.indexOf(a);
    const ib = FIRST_KEYS.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out = {};
  for (const k of keys) if (value[k] !== undefined) out[k] = stable(value[k]);
  return out;
}

const byName = (a, b) => (String(a?.name) < String(b?.name) ? -1 : String(a?.name) > String(b?.name) ? 1 : 0);

/**
 * The export bundle without noise: no exportedAt, types sorted by name.
 * Other collections the server exports (e.g. `components`) are kept, sorted
 * by name, so they round-trip through push.
 */
function normalizeBundle(bundle) {
  const types = Array.isArray(bundle?.contentTypes) ? bundle.contentTypes : [];
  const extras = {};
  for (const key of Object.keys(bundle || {}).sort()) {
    if (['version', 'exportedAt', 'contentTypes'].includes(key)) continue;
    const v = bundle[key];
    extras[key] = Array.isArray(v) ? stable(v).sort(byName) : stable(v);
  }
  return {
    version: bundle?.version || '1.0',
    ...extras,
    contentTypes: types
      .map((ct) => ({
        name: ct.name,
        displayName: ct.displayName ?? null,
        allowedMethods: ct.allowedMethods ?? null,
        schema: stable(Array.isArray(ct.schema) ? ct.schema : []),
      }))
      .sort(byName),
  };
}

/** Top-level arrays of named items besides contentTypes (e.g. components). */
function collections(...bundles) {
  const keys = new Set();
  for (const b of bundles) for (const [k, v] of Object.entries(b)) if (k !== 'contentTypes' && Array.isArray(v)) keys.add(k);
  return [...keys].sort();
}

const serialize = (bundle) => `${JSON.stringify(normalizeBundle(bundle), null, 2)}\n`;

function readBundle(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new CliError(`Cannot read ${file} — run "nodepress schema:pull" first, or pass --file`);
  }
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch (e) {
    throw new CliError(`${file} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(bundle?.contentTypes)) throw new CliError(`${file} has no "contentTypes" array`);
  return bundle;
}

// ─── Diff ──────────────────────────────────────────────────────────────────

const same = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

/**
 * Per-type changes a push would make: the server's dry run (validation +
 * field diff) plus displayName / allowedMethods, which the dry run doesn't
 * report, and the types only on the server (push leaves them alone).
 */
async function computeDiff(api, bundle) {
  const local = normalizeBundle(bundle);
  const { version: _v, ...payload } = local;
  const [dry, rawRemote] = await Promise.all([
    api('POST', '/content-types/import', { ...payload, dryRun: true, overwrite: true }),
    api('GET', '/content-types/export'),
  ]);
  const remote = normalizeBundle(rawRemote);
  const remoteByName = new Map(remote.contentTypes.map((ct) => [ct.name, ct]));
  const localByName = new Map(local.contentTypes.map((ct) => [ct.name, ct]));

  const types = (dry.preview || []).map((p) => {
    const mine = localByName.get(p.name) || local.contentTypes.find((ct) => ct.name?.toLowerCase() === p.name);
    const theirs = remoteByName.get(p.name);
    const entry = { name: p.name, valid: p.valid, error: p.error, isNew: !p.isExisting, fieldCount: p.fieldCount, fields: p.changes, meta: [] };
    if (theirs && mine) {
      if ((mine.displayName ?? null) !== null && !same(mine.displayName, theirs.displayName)) {
        entry.meta.push(`displayName: ${JSON.stringify(theirs.displayName)} → ${JSON.stringify(mine.displayName)}`);
      }
      if (!same(mine.allowedMethods, theirs.allowedMethods)) {
        entry.meta.push(`allowedMethods: ${JSON.stringify(theirs.allowedMethods)} → ${JSON.stringify(mine.allowedMethods)}`);
      }
    }
    entry.changed = entry.isNew || entry.meta.length > 0 || (entry.fields ? !entry.fields.unchanged : false);
    return entry;
  });
  const serverOnly = [...remoteByName.keys()].filter((n) => !types.some((t) => t.name === n));

  // Other collections (components…): compared here, by name.
  const others = [];
  for (const key of collections(local, remote)) {
    const theirs = new Map((remote[key] || []).map((x) => [x?.name, x]));
    const mine = new Map((local[key] || []).map((x) => [x?.name, x]));
    for (const [name, item] of mine) {
      const status = !theirs.has(name) ? 'new' : same(item, theirs.get(name)) ? 'unchanged' : 'changed';
      others.push({ key, name, status });
    }
    for (const name of theirs.keys()) if (!mine.has(name)) others.push({ key, name, status: 'serverOnly' });
  }

  return {
    types,
    serverOnly,
    others,
    errors: dry.errors || [],
    changed: types.some((t) => t.changed) || others.some((o) => o.status === 'new' || o.status === 'changed'),
    valid: dry.valid !== false && types.every((t) => t.valid),
  };
}

function printDiff(diff, out = console.log) {
  for (const o of diff.others) {
    const kind = o.key.replace(/s$/, '');
    if (o.status === 'new') out(`  ${green('+')} ${kind} ${bold(o.name)}  ${green('new')}`);
    else if (o.status === 'changed') out(`  ${yellow('~')} ${kind} ${bold(o.name)}  changed`);
    else if (o.status === 'serverOnly') out(`  ${cyan('?')} ${kind} ${o.name}  ${dim('only on the server — push does not delete it')}`);
    else out(`  ${dim('=')} ${dim(`${kind} ${o.name}`)}  ${dim('unchanged')}`);
  }
  const typeErrors = new Set(diff.types.map((t) => t.error).filter(Boolean));
  for (const e of diff.errors) if (!typeErrors.has(e)) out(`  ${red('✗')} ${red(e)}`);
  for (const t of diff.types) {
    if (!t.valid) {
      out(`  ${red('✗')} ${bold(t.name)}  ${red(t.error || 'invalid')}`);
      continue;
    }
    if (t.isNew) {
      out(`  ${green('+')} ${bold(t.name)}  ${green(`new content type (${t.fieldCount} field${t.fieldCount === 1 ? '' : 's'})`)}`);
      continue;
    }
    if (!t.changed) {
      out(`  ${dim('=')} ${dim(t.name)}  ${dim('unchanged')}`);
      continue;
    }
    out(`  ${yellow('~')} ${bold(t.name)}`);
    const f = t.fields || {};
    for (const n of f.added || []) out(`      ${green('+')} ${n}`);
    for (const n of f.removed || []) out(`      ${red('-')} ${n} ${dim('(existing entries keep the value; it is no longer shown or validated)')}`);
    for (const x of f.typeChanged || []) out(`      ${yellow('~')} ${x.name}: type ${x.from} → ${x.to}`);
    for (const n of f.nowRequired || []) out(`      ${yellow('~')} ${n}: now required`);
    for (const n of f.modified || []) out(`      ${yellow('~')} ${n}: settings changed`);
    for (const m of t.meta) out(`      ${yellow('~')} ${m}`);
  }
  for (const n of diff.serverOnly) out(`  ${cyan('?')} ${n}  ${dim('only on the server — push does not delete it')}`);
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function pull(api, opts) {
  const file = path.resolve(opts.out || opts.file || DEFAULT_FILE);
  const bundle = await api('GET', '/content-types/export');
  fs.writeFileSync(file, serialize(bundle));
  const n = bundle?.contentTypes?.length ?? 0;
  console.log(`  ${green('✓')} Wrote ${n} content type${n === 1 ? '' : 's'} to ${path.relative(process.cwd(), file) || file}`);
  return 0;
}

async function diffCmd(api, opts) {
  const file = opts.file || DEFAULT_FILE;
  const diff = await computeDiff(api, readBundle(file));
  printDiff(diff);
  if (!diff.valid) {
    console.error(`\n  ${red('✗')} ${file} has invalid content types — a push would be refused`);
    return 2;
  }
  console.log(diff.changed ? `\n  ${yellow('Changes to push.')}` : `\n  ${green('✓')} In sync with the server`);
  return diff.changed ? 1 : 0;
}

function confirm(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    }),
  );
}

async function push(api, opts) {
  const file = opts.file || DEFAULT_FILE;
  const bundle = readBundle(file);
  const diff = await computeDiff(api, bundle);
  printDiff(diff);
  if (!diff.valid) {
    console.error(`\n  ${red('✗')} Nothing pushed — fix the invalid content types first`);
    return 2;
  }
  if (!diff.changed) {
    console.log(`\n  ${green('✓')} Nothing to push — in sync with the server`);
    return 0;
  }
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error(`\n  ${red('✗')} Not a terminal — pass --yes to push without confirmation`);
      return 1;
    }
    if (!(await confirm(`\n  Apply these changes to ${opts.target}? [y/N] `))) {
      console.log('  Aborted — nothing changed');
      return 1;
    }
  }
  // Only the changed types, so unchanged ones get no new schema version.
  const changed = new Set(diff.types.filter((t) => t.changed).map((t) => t.name));
  const local = normalizeBundle(bundle);
  const body = { contentTypes: local.contentTypes.filter((ct) => changed.has(String(ct.name).toLowerCase()) || changed.has(ct.name)) };
  for (const key of collections(local)) {
    const send = new Set(diff.others.filter((o) => o.key === key && (o.status === 'new' || o.status === 'changed')).map((o) => o.name));
    if (send.size) body[key] = local[key].filter((x) => send.has(x?.name));
  }
  // The import route needs at least one type; when only components changed, send them all.
  if (!body.contentTypes.length) body.contentTypes = local.contentTypes;
  const result = await api('POST', '/content-types/import', { ...body, overwrite: true });
  const extra = Object.entries(result || {})
    .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && 'created' in v)
    .map(([k, v]) => `; ${k}: ${v.created || 0} created, ${v.updated || 0} updated`)
    .join('');
  console.log(`\n  ${green('✓')} Pushed: ${result.created || 0} created, ${result.updated || 0} updated${extra}`);
  return 0;
}

const COMMANDS = { 'schema:pull': pull, 'schema:diff': diffCmd, 'schema:push': push };

/** Entry point from bin/nodepress.js: resolves to the exit code. */
async function run(command, args, { fetchImpl } = {}) {
  try {
    const opts = parseArgs(args);
    const conn = connection(opts);
    if (!fetchImpl && typeof globalThis.fetch !== 'function') throw new CliError('Node.js 18 or newer is required (global fetch)');
    opts.target = conn.url;
    return await COMMANDS[command](createClient(conn, fetchImpl), opts);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    console.error(`  ${red('✗')} ${e.message}`);
    return 2;
  }
}

module.exports = (command, args) => run(command, args).then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(2);
});
module.exports.run = run;
module.exports.normalizeBundle = normalizeBundle;
module.exports.serialize = serialize;
module.exports.COMMANDS = Object.keys(COMMANDS);
