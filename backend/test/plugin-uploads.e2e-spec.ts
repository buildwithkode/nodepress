import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { makeKey, pluginZip } from './plugin-fixture';
import { env } from '../src/config/env';
import { PluginService } from '../src/plugin/plugin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { recordBootFailure, loadedPlugins } from '../src/plugin/plugin-loader';

/**
 * Upload → restart → enable, through the real app. A "restart" is a second app
 * booted with the plugins loaded afresh from the database.
 */
describe('Plugin uploads (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let editorToken: string;
  const publisher = makeKey();
  const saved = { mode: env.PLUGIN_UPLOADS, keys: env.PLUGIN_TRUSTED_KEYS, dir: process.env.PLUGINS_DIR };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-e2e-plugins-'));

  const http = () => request(app.getHttpServer());
  const upload = (zip: Buffer, dryRun = false, auth = token) =>
    http()
      .post(`/api/plugins/packages${dryRun ? '?dryRun=true' : ''}`)
      .set('Authorization', `Bearer ${auth}`)
      .attach('file', zip, { filename: 'plugin.zip', contentType: 'application/zip' });
  const list = async () =>
    (await http().get('/api/plugins').set('Authorization', `Bearer ${token}`).expect(200)).body;
  const find = async (id: string) => (await list()).plugins.find((p: any) => p.id === id);
  const toggle = (id: string, enabled: boolean) =>
    http().patch(`/api/plugins/${id}/toggle`).set('Authorization', `Bearer ${token}`).send({ enabled });
  const restart = async () => {
    await app.close();
    app = await createTestApp({ reloadPlugins: true });
  };

  beforeAll(async () => {
    process.env.PLUGINS_DIR = dir;
    (env as any).PLUGIN_UPLOADS = 'signed';
    (env as any).PLUGIN_TRUSTED_KEYS = publisher.pub;
    app = await createTestApp();
    await cleanDatabase(app);
    await app.get(PrismaService).installedPlugin.deleteMany({ where: { id: { in: ['hello', 'crashy'] } } });
    token = await registerAdmin(app);
    editorToken = (await inviteUser(app, token, 'editor@test.com', 'editor')).token;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
    (env as any).PLUGIN_UPLOADS = saved.mode;
    (env as any).PLUGIN_TRUSTED_KEYS = saved.keys;
    if (saved.dir === undefined) delete process.env.PLUGINS_DIR;
    else process.env.PLUGINS_DIR = saved.dir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('only admins can upload', async () => {
    await upload(pluginZip(), true, editorToken).expect(403);
  });

  it('rejects files that are not plugin packages', async () => {
    const res = await upload(Buffer.from('definitely not a zip file'), true).expect(400);
    expect(res.body.message).toMatch(/Not a zip/);
  });

  it('in signed mode, an unsigned package is reviewed but cannot be installed', async () => {
    const review = await upload(pluginZip(), true).expect(201);
    expect(review.body).toMatchObject({ id: 'hello', signature: 'unsigned', installable: false });
    expect(review.body.problems[0]).toMatch(/PLUGIN_TRUSTED_KEYS/);
    const res = await upload(pluginZip()).expect(400);
    expect(res.body.message).toMatch(/not signed/);
    expect(await find('hello')).toBeUndefined();
  });

  it('a package signed by an unknown key is refused (tampering is covered by the unit tests)', async () => {
    const stranger = makeKey();
    const res = await upload(pluginZip({ signWith: stranger.privateKey }), true).expect(201);
    expect(res.body).toMatchObject({ signature: 'untrusted', installable: false });
  });

  it("a bundled plugin's id can't be taken by an upload", async () => {
    await upload(pluginZip({ id: 'word-count', signWith: publisher.privateKey }), true).expect(409);
  });

  it('dry run reviews a signed package without installing it', async () => {
    const res = await upload(pluginZip({ signWith: publisher.privateKey, topFolder: 'hello-plugin' }), true).expect(201);
    expect(res.body).toMatchObject({
      id: 'hello', version: '1.0.0', signature: 'trusted', action: 'install', installable: true, problems: [],
      permissions: ['entries:read', 'entries:write'],
    });
    expect(res.body.signerKeyId).toMatch(/^[0-9a-f]{16}$/);
    expect(await find('hello')).toBeUndefined();
  });

  it('installs, and the plugin waits for a restart', async () => {
    const res = await upload(pluginZip({ signWith: publisher.privateKey })).expect(201);
    expect(res.body).toMatchObject({ installed: true, restartRequired: true, action: 'install' });
    const body = await list();
    expect(body.meta.restartRequired).toBe(true);
    expect(body.meta.uploads).toEqual({ mode: 'signed', maxUploadMb: env.PLUGIN_MAX_UPLOAD_MB });
    expect(body.plugins.find((p: any) => p.id === 'hello')).toMatchObject({ pending: 'install', enabled: false, source: 'uploaded' });
    await http().get('/api/plug-hello').expect(404); // not loaded yet
  });

  it('after a restart it is loaded but disabled; enabling it turns on its routes (in a sub-module) and hooks', async () => {
    await restart();
    const p = await find('hello');
    expect(p).toMatchObject({ source: 'uploaded', pending: null, enabled: false, signature: 'trusted', loadError: null });
    expect((await list()).meta.restartRequired).toBe(false);
    await http().get('/api/plug-hello').expect(404); // disabled → gated

    await toggle('hello', true).expect(200);
    expect((await http().get('/api/plug-hello').expect(200)).body).toEqual({ hello: 'hello' });

    const ct = await http()
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'note', schema: [{ name: 'title', type: 'text' }] })
      .expect(201);
    const entry = await http()
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId: ct.body.id, slug: 'hi', status: 'draft', data: { title: 'Hi' } })
      .expect(201);
    expect(entry.body.data._hello).toBe('hello');
  });

  it('an update keeps the plugin enabled and waits for a restart', async () => {
    const res = await upload(pluginZip({ version: '1.1.0', signWith: publisher.privateKey })).expect(201);
    expect(res.body).toMatchObject({ action: 'update', currentVersion: '1.0.0' });
    expect(await find('hello')).toMatchObject({ pending: 'update', pendingVersion: '1.1.0', version: '1.0.0' });
    await restart();
    expect(await find('hello')).toMatchObject({ version: '1.1.0', pending: null, enabled: true });
    await http().get('/api/plug-hello').expect(200);
  });

  it('an enabled plugin must be disabled before it is deleted', async () => {
    await http().delete('/api/plugins/packages/hello').set('Authorization', `Bearer ${token}`).expect(400);
    await toggle('hello', false).expect(200);
    const res = await http().delete('/api/plugins/packages/hello').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ deleted: true, restartRequired: true });
    expect(await find('hello')).toMatchObject({ pending: 'remove' });
    await restart();
    expect(await find('hello')).toBeUndefined();
    await http().delete('/api/plugins/packages/word-count').set('Authorization', `Bearer ${token}`).expect(400);
  });

  it('a plugin that breaks startup is switched off, and the next start succeeds', async () => {
    await upload(pluginZip({ id: 'crashy', signWith: publisher.privateKey, crash: true })).expect(201);
    await app.close();
    const err = await createTestApp({ reloadPlugins: true }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/boom from crashy/);
    expect(await recordBootFailure(err, loadedPlugins())).toEqual(['crashy']);

    app = await createTestApp({ reloadPlugins: true });
    const p = await find('crashy');
    expect(p.loadError).toMatch(/Switched off automatically.*boom from crashy/);
    expect(p.enabled).toBe(false);
    expect((await toggle('crashy', true).expect(400)).body.message).toMatch(/can't be enabled/);

    // A fixed version clears it.
    await upload(pluginZip({ id: 'crashy', version: '1.0.1', signWith: publisher.privateKey })).expect(201);
    await restart();
    expect(await find('crashy')).toMatchObject({ loadError: null, version: '1.0.1' });
  });

  it('with PLUGIN_UPLOADS=unsigned an unsigned package installs with a warning', async () => {
    (env as any).PLUGIN_UPLOADS = 'unsigned';
    try {
      const res = await upload(pluginZip({ id: 'loose' }), true).expect(201);
      expect(res.body.installable).toBe(true);
      expect(res.body.warnings[0]).toMatch(/not signed/);
    } finally {
      (env as any).PLUGIN_UPLOADS = 'signed';
    }
  });

  it('with PLUGIN_UPLOADS=off uploads and deletes are refused', async () => {
    (env as any).PLUGIN_UPLOADS = 'off';
    try {
      await upload(pluginZip({ signWith: publisher.privateKey }), true).expect(403);
      await http().delete('/api/plugins/packages/crashy').set('Authorization', `Bearer ${token}`).expect(403);
    } finally {
      (env as any).PLUGIN_UPLOADS = 'signed';
    }
  });

  it('restart answers 202, then exits the process', async () => {
    const svc = app.get(PluginService);
    const exit = jest.fn();
    svc.exitProcess = exit;
    await http().post('/api/plugins/restart').set('Authorization', `Bearer ${editorToken}`).expect(403);
    await http().post('/api/plugins/restart').set('Authorization', `Bearer ${token}`).expect(202);
    await new Promise((r) => setTimeout(r, 700));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
