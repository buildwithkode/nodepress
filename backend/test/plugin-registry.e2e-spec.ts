import { createHash } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { makeKey, pluginZip } from './plugin-fixture';
import { env } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';
import { PluginRegistryService } from '../src/plugin/plugin-registry.service';

/**
 * Plugins → Browse against a fake registry on 127.0.0.1. Downloads from a
 * private address are refused by default; the tests relax that explicitly
 * (PluginRegistryService.downloadPolicy) to install from the fake server.
 */
describe('Plugin directory (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let editorToken: string;
  let server: http.Server;
  let base: string;
  let registryStatus = 200;
  const publisher = makeKey();
  const saved = { mode: env.PLUGIN_UPLOADS, keys: env.PLUGIN_TRUSTED_KEYS, url: env.PLUGIN_REGISTRY_URL, dir: process.env.PLUGINS_DIR };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-e2e-registry-'));

  const zips: Record<string, Buffer> = {
    'hello.zip': pluginZip({ id: 'hello', version: '1.0.0', signWith: publisher.privateKey }),
    'unsigned.zip': pluginZip({ id: 'unsigned-one' }),
    'liar.zip': pluginZip({ id: 'someone-else', signWith: publisher.privateKey }),
  };
  const sha = (name: string) => createHash('sha256').update(zips[name]).digest('hex');
  const entry = (id: string, file: string, over: Record<string, any> = {}) => ({
    id,
    name: `Plugin ${id}`,
    description: 'From the fake registry',
    nodepress: '>=1.0.0',
    homepage: 'https://example.com/' + id,
    latest: { version: '1.0.0', downloadUrl: `${base}/files/${file}`, sha256: sha(file) },
    ...over,
  });
  const registry = () => ({
    version: 1,
    plugins: [
      { id: 'word-count', name: 'Word Count', nodepress: '^1.6.0', latest: { version: '1.2.0' }, bundled: true },
      entry('hello', 'hello.zip', { tags: ['demo'] }),
      entry('unsigned-one', 'unsigned.zip'),
      entry('someone-else-listed', 'liar.zip'),
      entry('tampered', 'hello.zip', { latest: { version: '1.0.0', downloadUrl: `${base}/files/hello.zip`, sha256: 'b'.repeat(64) } }),
      entry('future', 'hello.zip', { nodepress: '^99.0.0' }),
      { id: 'paid-thing', name: 'Paid', nodepress: '>=1.0.0', pricing: 'paid', homepage: 'https://example.com/buy' },
      { id: 'BROKEN' },
    ],
  });

  const http_ = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const list = async (query = '') => (await http_().get(`/api/plugins/registry${query}`).set(auth()).expect(200)).body;
  const install = (id: string, dryRun: boolean) =>
    http_().post(`/api/plugins/registry/${id}/install${dryRun ? '?dryRun=true' : ''}`).set(auth());
  const service = () => app.get(PluginRegistryService);

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/registry.json') {
        if (registryStatus !== 200) { res.writeHead(registryStatus); res.end('down'); return; }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(registry()));
        return;
      }
      const file = req.url?.startsWith('/files/') && zips[req.url.slice('/files/'.length)];
      if (file) { res.setHeader('content-type', 'application/zip'); res.end(file); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    process.env.PLUGINS_DIR = dir;
    (env as any).PLUGIN_UPLOADS = 'signed';
    (env as any).PLUGIN_TRUSTED_KEYS = publisher.pub;
    (env as any).PLUGIN_REGISTRY_URL = `${base}/registry.json`;
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    editorToken = (await inviteUser(app, token, 'editor@test.com', 'editor')).token;
  });

  afterAll(async () => {
    await app.get(PrismaService).installedPlugin.deleteMany({ where: { id: { in: ['hello'] } } });
    await cleanDatabase(app);
    await app.close();
    await new Promise((r) => server.close(r));
    (env as any).PLUGIN_UPLOADS = saved.mode;
    (env as any).PLUGIN_TRUSTED_KEYS = saved.keys;
    (env as any).PLUGIN_REGISTRY_URL = saved.url;
    if (saved.dir === undefined) delete process.env.PLUGINS_DIR;
    else process.env.PLUGINS_DIR = saved.dir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is admin only', async () => {
    await http_().get('/api/plugins/registry').expect(401);
    await http_().get('/api/plugins/registry').set(auth(editorToken)).expect(403);
    await http_().post('/api/plugins/registry/hello/install?dryRun=true').set(auth(editorToken)).expect(403);
  });

  it('lists valid entries with installed / compatible / installable flags', async () => {
    const body = await list();
    expect(body).toMatchObject({ enabled: true, stale: false, error: null, skipped: 1 });
    const byId = Object.fromEntries(body.plugins.map((p: any) => [p.id, p]));
    expect(Object.keys(byId)).toEqual(['word-count', 'hello', 'unsigned-one', 'someone-else-listed', 'tampered', 'future', 'paid-thing']);
    expect(byId['word-count']).toMatchObject({ bundled: true, installed: true, installable: false, compatible: true });
    expect(byId.hello).toMatchObject({ installed: false, installable: true, compatible: true, tags: ['demo'], pricing: 'free' });
    expect(byId.future).toMatchObject({ compatible: false, installable: false });
    expect(byId.future.incompatible).toMatch(/Requires NodePress \^99/);
    expect(byId['paid-thing']).toMatchObject({ pricing: 'paid', installable: false, homepage: 'https://example.com/buy' });
  });

  it('refuses to download from a private address (and over http) by default', async () => {
    const res = await install('hello', true).expect(502);
    expect(res.body.message).toMatch(/Only https|private or reserved/);
  });

  describe('with downloads from the fake server allowed', () => {
    beforeAll(() => { service().downloadPolicy = { allowHttp: true, allowPrivate: true }; });
    afterAll(() => { service().downloadPolicy = { allowHttp: false, allowPrivate: false }; });

    it('refuses a download whose sha256 does not match', async () => {
      const res = await install('tampered', true).expect(400);
      expect(res.body.message).toMatch(/does not match the sha256/);
    });

    it('applies the upload signature policy', async () => {
      const review = (await install('unsigned-one', true).expect(201)).body;
      expect(review).toMatchObject({ id: 'unsigned-one', signature: 'unsigned', installable: false });
      expect(review.problems[0]).toMatch(/PLUGIN_TRUSTED_KEYS/);
      await install('unsigned-one', false).expect(400);
    });

    it('refuses a package whose id differs from the directory entry', async () => {
      const review = (await install('someone-else-listed', true).expect(201)).body;
      expect(review.installable).toBe(false);
      expect(review.problems[0]).toMatch(/"someone-else", but the directory lists it as "someone-else-listed"/);
      await install('someone-else-listed', false).expect(400);
    });

    it('reviews, then installs a signed package like an upload', async () => {
      const review = (await install('hello', true).expect(201)).body;
      expect(review).toMatchObject({ id: 'hello', signature: 'trusted', installable: true, action: 'install' });
      expect(review.registry.sha256).toBe(sha('hello.zip'));

      const done = (await install('hello', false).expect(201)).body;
      expect(done).toMatchObject({ installed: true, restartRequired: true });
      const stored = await app.get(PrismaService).pluginPackage.findUnique({ where: { id: 'hello' } });
      expect(stored?.sha256).toBe(sha('hello.zip'));

      const hello = (await list()).plugins.find((p: any) => p.id === 'hello');
      expect(hello).toMatchObject({ installed: true, installedVersion: '1.0.0', installable: false });
    });

    it('bundled and download-less entries cannot be installed', async () => {
      await install('word-count', true).expect(400);
      expect((await install('paid-thing', true).expect(400)).body.message).toMatch(/example\.com\/buy/);
      await install('not-listed', true).expect(404);
    });
  });

  it('keeps the last good copy when the registry is down', async () => {
    registryStatus = 500;
    try {
      const body = await list('?refresh=true');
      expect(body).toMatchObject({ stale: true });
      expect(body.error).toMatch(/HTTP 500/);
      expect(body.plugins.length).toBeGreaterThan(0);

      service().clearCache();
      const empty = await list();
      expect(empty).toMatchObject({ enabled: true, stale: false, plugins: [] });
      expect(empty.error).toMatch(/HTTP 500/);
    } finally {
      registryStatus = 200;
    }
  });

  it('rejects a registry with the wrong shape without a 500', async () => {
    const saved = env.PLUGIN_REGISTRY_URL;
    (env as any).PLUGIN_REGISTRY_URL = `${base}/files/hello.zip`; // not JSON
    try {
      const body = await list();
      expect(body.error).toMatch(/not valid JSON/);
    } finally {
      (env as any).PLUGIN_REGISTRY_URL = saved;
    }
  });

  it('an empty PLUGIN_REGISTRY_URL turns the directory off', async () => {
    (env as any).PLUGIN_REGISTRY_URL = '';
    try {
      expect(await list()).toMatchObject({ enabled: false, plugins: [] });
      await install('hello', true).expect(400);
    } finally {
      (env as any).PLUGIN_REGISTRY_URL = `${base}/registry.json`;
    }
  });
});
