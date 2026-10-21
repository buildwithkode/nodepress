import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readZip, writeZip, stripTopFolder } from './plugin-archive';
import { inspectPackage, MANIFEST_FILE, SIGNATURE_FILE } from './plugin-package';
import { loadPackages, PackageRow } from './plugin-loader';
import { PluginRegistry } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { PluginEvents } from './plugin.events';
import { JobsService } from '../jobs/jobs.service';
import { env } from '../config/env';
import { makeKey, pluginFiles, pluginZip } from '../../test/plugin-fixture';

const limits = { maxFiles: 100, maxUnpackedBytes: 1024 * 1024 };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('plugin archives', () => {
  it('round-trips files', () => {
    const zip = writeZip({ 'a.txt': 'hello', 'dir/b.json': '{"x":1}' });
    const files = readZip(zip, limits);
    expect(files.get('a.txt')!.toString()).toBe('hello');
    expect(files.get('dir/b.json')!.toString()).toBe('{"x":1}');
  });

  it.each(['../evil.js', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b'])('refuses the unsafe path %s', (name) => {
    expect(() => readZip(writeZip({ [name]: 'x' }), limits)).toThrow(/Unsafe path/);
  });

  it('refuses archives that unpack too large or hold too many files', () => {
    const big = writeZip({ 'big.bin': Buffer.alloc(2 * 1024 * 1024) }); // compresses to almost nothing
    expect(big.length).toBeLessThan(10_000);
    expect(() => readZip(big, limits)).toThrow(/unpacks to more than/);
    const many = writeZip(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`f${i}`, ''])));
    expect(() => readZip(many, limits)).toThrow(/Too many files/);
  });

  it('rejects non-zips and drops a single top folder', () => {
    expect(() => readZip(Buffer.from('not a zip at all, sorry'), limits)).toThrow(/Not a zip/);
    const files = stripTopFolder(readZip(pluginZip({ topFolder: 'hello-1.0.0' }), limits), MANIFEST_FILE);
    expect(files.has(MANIFEST_FILE)).toBe(true);
    expect(files.has('dist/index.js')).toBe(true);
  });
});

describe('plugin packages', () => {
  const publisher = makeKey();
  const stranger = makeKey();
  const inspect = (zip: Buffer, trustedKeys = [publisher.pub]) => inspectPackage(zip, { trustedKeys, limits, coreVersion: '1.6.0' });

  it('reads the manifest without running code and reports the signature', () => {
    expect(inspect(pluginZip()).signature.status).toBe('unsigned');
    const signed = inspect(pluginZip({ signWith: publisher.privateKey }));
    expect(signed.signature.status).toBe('trusted');
    expect(signed.signature.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(signed.manifest.id).toBe('hello');
    expect(inspect(pluginZip({ signWith: stranger.privateKey })).signature.status).toBe('untrusted');
  });

  it('a file changed after signing invalidates the signature', () => {
    const files = pluginFiles({ signWith: publisher.privateKey });
    files.set('dist/index.js', Buffer.from(files.get('dist/index.js')!.toString() + '\n// sneaky'));
    expect(inspect(writeZip(files)).signature.status).toBe('invalid');
    files.set('dist/extra.js', Buffer.from('1'));
    expect(inspect(writeZip(files)).signature.status).toBe('invalid');
  });

  it('validates the manifest', () => {
    const withManifest = (patch: Record<string, any>) => {
      const files = pluginFiles();
      files.set(MANIFEST_FILE, Buffer.from(JSON.stringify({ ...JSON.parse(files.get(MANIFEST_FILE)!.toString()), ...patch })));
      return writeZip(files);
    };
    expect(() => inspect(withManifest({ id: 'Bad Id' }))).toThrow(/kebab-case/);
    expect(() => inspect(withManifest({ version: 'one' }))).toThrow(/semver/);
    expect(() => inspect(withManifest({ nodepress: undefined }))).toThrow(/nodepress/);
    expect(() => inspect(withManifest({ permissions: ['root:everything'] }))).toThrow(/Unknown permission/);
    expect(() => inspect(withManifest({ main: 'dist/missing.js' }))).toThrow(/missing from the package/);
    const files = pluginFiles();
    files.delete(MANIFEST_FILE);
    expect(() => inspect(writeZip(files))).toThrow(/nodepress-plugin.json is missing/);
    expect(inspect(withManifest({ nodepress: '^9.0.0' })).incompatible).toMatch(/Requires NodePress \^9\.0\.0/);
  });

  it('the signature file itself is not covered', () => {
    const files = pluginFiles({ signWith: publisher.privateKey });
    expect(files.has(SIGNATURE_FILE)).toBe(true);
    expect(inspect(writeZip(files)).signature.status).toBe('trusted');
  });
});

describe('loading uploaded packages', () => {
  let dir: string;
  const original = { mode: env.PLUGIN_UPLOADS, keys: env.PLUGIN_TRUSTED_KEYS };
  const row = (zip: Buffer, extra: Partial<PackageRow> = {}): PackageRow => ({
    id: 'hello', version: '1.0.0', archive: zip, sha256: sha(zip), loadError: null, ...extra,
  });
  const load = (rows: PackageRow[], bundledIds = new Set<string>()) => loadPackages(rows, { dir, bundledIds });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-plugins-'));
    (env as any).PLUGIN_UPLOADS = 'unsigned';
  });
  afterEach(() => {
    (env as any).PLUGIN_UPLOADS = original.mode;
    (env as any).PLUGIN_TRUSTED_KEYS = original.keys;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('unpacks once, requires the entry, and the plugin runs on the core SDK', async () => {
    const zip = pluginZip({ id: 'hello' });
    const [plugin] = load([row(zip)]);
    expect(plugin.loadError).toBeUndefined();
    expect(typeof plugin.module).toBe('function');
    expect(fs.existsSync(path.join(plugin.dir!, '.complete'))).toBe(true);

    // The plugin's PluginContextModule must be the core's, or this injection fails.
    const registry = new PluginRegistry();
    const bus = new PluginHookBus(registry);
    registry.register({ manifest: plugin.manifest, module: plugin.module, enabled: true, config: {} });
    @Global()
    @Module({
      providers: [
        { provide: PluginRegistry, useValue: registry },
        { provide: PluginHookBus, useValue: bus },
        { provide: JobsService, useValue: {} },
      ],
      exports: [PluginRegistry, PluginHookBus, JobsService],
    })
    class CoreStub {}
    const app = await Test.createTestingModule({ imports: [CoreStub, plugin.module!] }).compile();
    await app.init();
    const payload: any = { data: {} };
    await bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, payload);
    expect(payload.data._hello).toBe('hello');
    await app.close();

    // A second boot reuses the unpacked copy.
    const mtime = fs.statSync(path.join(plugin.dir!, '.complete')).mtimeMs;
    load([row(zip)]);
    expect(fs.statSync(path.join(plugin.dir!, '.complete')).mtimeMs).toBe(mtime);
  });

  it('removes unpacked copies of replaced packages', () => {
    const [v1] = load([row(pluginZip({ id: 'hello' }))]);
    const [v2] = load([row(pluginZip({ id: 'hello', version: '1.1.0' }), { version: '1.1.0' })]);
    expect(fs.existsSync(v2.dir!)).toBe(true);
    expect(fs.existsSync(v1.dir!)).toBe(false);
  });

  it('lists broken packages with the reason instead of throwing', () => {
    const zip = pluginZip({ id: 'hello' });
    expect(load([row(zip)], new Set(['hello']))[0].loadError).toMatch(/bundled plugin already uses this id/);
    expect(load([row(zip, { sha256: 'f'.repeat(64) })])[0].loadError).toMatch(/checksum/);
    expect(load([row(zip, { loadError: 'Switched off automatically: boom' })])[0].loadError).toMatch(/Switched off/);
    const lying = pluginZip({ id: 'hello', codeManifest: { permissions: ['*'] } });
    expect(load([row(lying)])[0].loadError).toMatch(/differs from nodepress-plugin.json/);
    const syntax = pluginFiles({ id: 'hello' });
    syntax.set('dist/index.js', Buffer.from('this is not javascript ('));
    const broken = load([row(writeZip(syntax))])[0];
    expect(broken.loadError).toMatch(/Failed to load/);
    expect(broken.module).toBeNull();
  });

  it('in signed mode, only loads packages signed by a trusted key', () => {
    const key = makeKey();
    (env as any).PLUGIN_UPLOADS = 'signed';
    (env as any).PLUGIN_TRUSTED_KEYS = key.pub;
    expect(load([row(pluginZip({ id: 'hello' }))])[0].loadError).toMatch(/not from a trusted key/);
    expect(load([row(pluginZip({ id: 'hello', signWith: key.privateKey }))])[0].loadError).toBeUndefined();
  });
});
