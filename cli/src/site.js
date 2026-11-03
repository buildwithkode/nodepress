'use strict';

/**
 * `site:export`, `site:import` — move a whole site (content model + every entry) between installs.
 *
 *   nodepress site:export [--out nodepress-site.json]
 *   nodepress site:import <file> [--dry-run] [--keep-existing] [--yes]
 *
 * Talks to GET /api/site/export and POST /api/site/import. Connection as for
 * schema:*: NODEPRESS_URL + NODEPRESS_TOKEN (or --url / --token), an API key with
 * "all" access to every content type (np_…) or an admin JWT.
 *
 * Import always previews first and asks before writing (--yes skips the question).
 * Entries are matched by content type + slug + locale; relations keep working.
 * Media files are not part of the file. Exit codes: 0 ok, 1 invalid file or
 * aborted, 2 error.
 */

const fs = require('fs');
const path = require('path');
const { CliError, connection, createClient, confirm } = require('./schema');

const DEFAULT_FILE = 'nodepress-site.json';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = c(32);
const red = c(31);
const yellow = c(33);
const dim = c(2);
const bold = c(1);

function parseArgs(args) {
  const opts = { yes: false, dryRun: false, keepExisting: false, files: [] };
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
    else if (flag === '--dry-run') opts.dryRun = true;
    else if (flag === '--keep-existing') opts.keepExisting = true;
    else if (flag === '--out' || flag === '-o') opts.out = value();
    else if (flag === '--file' || flag === '-f') opts.files.push(value());
    else if (flag === '--url') opts.url = value();
    else if (flag === '--token') opts.token = value();
    else if (a.startsWith('-')) throw new CliError(`Unknown option "${a}"`);
    else opts.files.push(a);
  }
  return opts;
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

async function exportCmd(api, opts) {
  const bundle = await api('GET', '/site/export');
  const file = path.resolve(opts.out || DEFAULT_FILE);
  fs.writeFileSync(file, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  const entries = Object.values(bundle.entries || {}).reduce((n, list) => n + list.length, 0);
  console.log(`  ${green('✓')} Saved ${path.relative(process.cwd(), file) || file}: ${plural((bundle.contentTypes || []).length, 'content type')}, ${plural((bundle.components || []).length, 'component')}, ${plural((bundle.choiceLists || []).length, 'choice list')}, ${plural(entries, 'entry', 'entries')}, ${plural((bundle.forms || []).length, 'form')}, ${plural((bundle.webhooks || []).length, 'webhook')}, ${plural((bundle.redirects || []).length, 'redirect')}`);
  console.log(dim('    Media files, form submissions and redirect hit counts are not included; entries keep their media links.'));
  if ((bundle.forms || []).length || (bundle.webhooks || []).length) console.log(dim('    Form settings and webhook secrets are in the file: keep it private.'));
  return 0;
}

function printPreview(p) {
  if (p.schemas) {
    console.log(`\n  ${bold('Content types')}: ${p.schemas.toCreate} new, ${p.schemas.toUpdate} to update`);
    for (const t of p.schemas.preview || []) console.log(`    ${t.isExisting ? yellow('~') : green('+')} ${t.name}`);
  }
  const e = p.entries;
  console.log(`\n  ${bold('Entries')}: ${e.toCreate} new, ${e.toUpdate} to update, ${e.toRestore} to restore from the trash, ${e.toSkip} kept as they are`);
  for (const t of e.types) {
    const parts = [t.toCreate && `${t.toCreate} new`, t.toUpdate && `${t.toUpdate} update`, t.toRestore && `${t.toRestore} restore`, t.toSkip && `${t.toSkip} kept`].filter(Boolean);
    console.log(`    ${t.name}: ${parts.join(', ') || dim('nothing')}`);
  }
  if (e.relinked) console.log(dim(`    ${plural(e.relinked, 'entry', 'entries')} get this site's ids; relations to them are updated`));
  if (p.forms?.total) console.log(`\n  ${bold('Forms')}: ${p.forms.toCreate} new, ${p.forms.toUpdate} to update, ${p.forms.toSkip} kept as they are`);
  if (p.webhooks?.total) console.log(`\n  ${bold('Webhooks')}: ${p.webhooks.toCreate} new, ${p.webhooks.toUpdate} to update, ${p.webhooks.toSkip} kept as they are`);
  if (p.redirects?.total) console.log(`\n  ${bold('Redirects')}: ${p.redirects.toCreate} new, ${p.redirects.toUpdate} to update, ${p.redirects.toSkip} kept as they are`);
  if (p.webhooks?.active?.length) {
    console.log(`\n  ${yellow('After the import, this site sends events to:')}`);
    for (const url of p.webhooks.active) console.log(`    ${url}`);
  }
  if (p.localesToAdd?.length) console.log(`\n  ${bold('Languages to add')}: ${p.localesToAdd.join(', ')}`);
  if (p.errors.length) {
    console.log(`\n  ${red(plural(p.errors.length, 'problem'))}:`);
    for (const msg of p.errors.slice(0, 50)) console.log(`    ${red('✗')} ${msg}`);
    if (p.errors.length > 50) console.log(`    …and ${p.errors.length - 50} more`);
  }
}

async function importCmd(api, opts) {
  if (opts.files.length !== 1) throw new CliError('Give the file to import: nodepress site:import nodepress-site.json');
  let bundle;
  try {
    bundle = JSON.parse(fs.readFileSync(opts.files[0], 'utf8'));
  } catch (e) {
    throw new CliError(`Could not read ${opts.files[0]}: ${e.message}`);
  }
  const query = `overwrite=${opts.keepExisting ? 'false' : 'true'}`;
  const preview = await api('POST', `/site/import?dryRun=true&${query}`, bundle);
  printPreview(preview);
  if (!preview.valid) {
    console.error(`\n  ${red('✗')} Nothing imported — fix the problems first`);
    return 1;
  }
  if (opts.dryRun) {
    console.log(`\n  ${green('✓')} Dry run — nothing changed`);
    return 0;
  }
  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error(`\n  ${red('✗')} Not a terminal — pass --yes to import without confirmation`);
      return 1;
    }
    if (!(await confirm(`\n  Import this into ${opts.target}? [y/N] `))) {
      console.log('  Aborted — nothing changed');
      return 1;
    }
  }
  const r = await api('POST', `/site/import?${query}`, bundle);
  const s = r.schemas;
  console.log(`\n  ${green('✓')} Imported: ${s ? `content types ${s.created || 0} created, ${s.updated || 0} updated; ` : ''}entries ${r.entries.created} created, ${r.entries.updated} updated${r.forms ? `; forms ${r.forms.created} created, ${r.forms.updated} updated` : ''}${r.webhooks ? `; webhooks ${r.webhooks.created} created, ${r.webhooks.updated} updated` : ''}${r.redirects ? `; redirects ${r.redirects.created} created, ${r.redirects.updated} updated` : ''}`);
  if (r.localesAdded?.length) console.log(`    Languages added: ${r.localesAdded.join(', ')}`);
  if (r.errors?.length) {
    for (const msg of r.errors) console.log(`    ${red('✗')} ${msg}`);
    return 1;
  }
  return 0;
}

const COMMANDS = { 'site:export': exportCmd, 'site:import': importCmd };

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
