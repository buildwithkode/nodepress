'use strict';

/**
 * `plugin keygen` and `plugin pack` — build uploadable plugin packages.
 *
 * The package format and signature must match backend/src/plugin/plugin-package.ts:
 * a zip with nodepress-plugin.json at the root, the files it lists, and an
 * optional nodepress-plugin.sig signing "NODEPRESS-PLUGIN-1\n" followed by
 * "<sha256>  <path>\n" for every other file, sorted by path. Zero dependencies.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const MANIFEST_FILE = 'nodepress-plugin.json';
const SIGNATURE_FILE = 'nodepress-plugin.sig';
const ALWAYS = /^(README|LICENSE|LICENCE|CHANGELOG)(\.[a-z]+)?$/i;
const SKIP = new Set(['.git', '.DS_Store', '.cache']);

function fail(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
}

// ── zip writer (deflate, no zip64) ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, deflated);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(deflated.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

// ── signing ──────────────────────────────────────────────────────────────────
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function packageMessage(files) {
  const lines = [...files.keys()]
    .filter((p) => p !== SIGNATURE_FILE)
    .sort()
    .map((p) => `${sha256(files.get(p))}  ${p}\n`);
  return Buffer.from('NODEPRESS-PLUGIN-1\n' + lines.join(''));
}

function publicKeyString(privateKey) {
  return crypto.createPublicKey(privateKey).export({ format: 'jwk' }).x;
}

// ── commands ─────────────────────────────────────────────────────────────────
function keygen(argv) {
  const out = path.resolve(flag(argv, '--out') || 'nodepress-plugin-key.pem');
  if (fs.existsSync(out)) fail(`${out} already exists — not overwriting a signing key.`);
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(out, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  console.log(`
  ✔ Private signing key written to ${out}
    Keep it secret and out of git. Anyone with it can sign plugins as you.

  Public key — add it to PLUGIN_TRUSTED_KEYS on the servers that should trust your plugins:

    ${publicKeyString(privateKey)}
`);
}

function walk(root, rel, out) {
  const abs = path.join(root, rel);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(abs)) {
      if (!SKIP.has(name)) walk(root, rel ? `${rel}/${name}` : name, out);
    }
  } else if (stat.isFile()) {
    out.set(rel, fs.readFileSync(abs));
  }
}

function pack(argv, positionals) {
  const dir = path.resolve(positionals[0] || '.');
  const manifestPath = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) fail(`No ${MANIFEST_FILE} in ${dir}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`${MANIFEST_FILE} is not valid JSON: ${e.message}`);
  }
  for (const key of ['id', 'name', 'version', 'nodepress']) {
    if (!manifest[key]) fail(`${MANIFEST_FILE} needs "${key}"`);
  }
  const main = manifest.main || 'dist/index.js';
  if (!fs.existsSync(path.join(dir, main))) fail(`Entry file ${main} doesn't exist — build the plugin first.`);

  const files = new Map([[MANIFEST_FILE, fs.readFileSync(manifestPath)]]);
  for (const name of fs.readdirSync(dir)) {
    if (ALWAYS.test(name) && fs.statSync(path.join(dir, name)).isFile()) files.set(name, fs.readFileSync(path.join(dir, name)));
  }
  for (const entry of manifest.files || ['dist']) {
    const rel = entry.replace(/^\.\//, '').replace(/\/$/, '');
    if (!fs.existsSync(path.join(dir, rel))) fail(`"files" lists ${entry}, which doesn't exist`);
    walk(dir, rel, files);
  }
  files.delete(SIGNATURE_FILE);
  if (!files.has(main)) fail(`Entry file ${main} isn't covered by "files" in ${MANIFEST_FILE}`);

  const keyPath = flag(argv, '--key') || process.env.NODEPRESS_PLUGIN_KEY;
  let signedBy = null;
  if (keyPath) {
    let privateKey;
    try {
      privateKey = crypto.createPrivateKey(fs.readFileSync(path.resolve(keyPath)));
    } catch (e) {
      fail(`Could not read the signing key ${keyPath}: ${e.message}`);
    }
    if (privateKey.asymmetricKeyType !== 'ed25519') fail('The signing key must be an Ed25519 key (create one with `plugin keygen`).');
    const signature = crypto.sign(null, packageMessage(files), privateKey).toString('base64');
    signedBy = publicKeyString(privateKey);
    files.set(SIGNATURE_FILE, Buffer.from(JSON.stringify({ alg: 'ed25519', key: signedBy, signature }, null, 2)));
  }

  const out = path.resolve(flag(argv, '--out') || flag(argv, '-o') || `${manifest.id}-${manifest.version}.zip`);
  const zip = writeZip(files);
  fs.writeFileSync(out, zip);
  const shared = [...files.keys()].filter((f) => /^node_modules\/(@nestjs\/|@prisma\/|rxjs\/|reflect-metadata\/)/.test(f));
  console.log(`
  ✔ ${path.relative(process.cwd(), out) || out}  (${files.size} files, ${(zip.length / 1024).toFixed(1)} KB)
    ${manifest.name} v${manifest.version} · NodePress ${manifest.nodepress}
    ${signedBy ? `Signed with key ${sha256(Buffer.from(signedBy, 'base64url')).slice(0, 16)}` : 'Not signed — servers with PLUGIN_UPLOADS=signed (the default) will refuse it. Use --key.'}
${shared.length ? `\n  ⚠ It bundles packages NodePress provides (@nestjs, @prisma, rxjs, reflect-metadata) — they are ignored at runtime; leave them out to save space.\n` : ''}
  Upload it at Plugins → Upload plugin.
`);
}

const HELP = `
  Plugin packages

    plugin keygen [--out key.pem]                       Create an Ed25519 signing key
    plugin pack [dir] [--key key.pem] [--out file.zip]  Zip (and sign) a built plugin for upload

  The plugin directory needs nodepress-plugin.json (id, name, version, nodepress,
  permissions, main) and its built files; "files" lists what to include (default ["dist"]).
  NODEPRESS_PLUGIN_KEY can point at the key instead of --key.
`;

/** `argv` without the leading "plugin"; flag values (--key x) aren't positionals. */
module.exports = function plugin(argv) {
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--key' || argv[i] === '--out' || argv[i] === '-o') i++;
    else if (!argv[i].startsWith('-')) positionals.push(argv[i]);
  }
  const [command, ...rest] = positionals;
  if (command === 'keygen') return keygen(argv);
  if (command === 'pack') return pack(argv, rest);
  console.log(HELP);
  if (command) process.exit(1);
};
