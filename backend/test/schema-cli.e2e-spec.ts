import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { spawn } from 'child_process';
import { AddressInfo } from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const CLI = path.join(__dirname, '../../cli/bin/nodepress.js');

/** Run the CLI and collect its exit code and output. */
function cli(args: string[], env: Record<string, string>, cwd: string) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const proc = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

/** Schema export/import with API keys, and `nodepress schema:pull/diff/push` against the API. */
describe('Schema as code (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let adminToken: string;
  const keys: Record<string, string> = {};
  let env: Record<string, string>;
  let dir: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);
    auth = { Authorization: `Bearer ${adminToken}` };
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const server = app.getHttpServer();

    await request(server).post('/api/content-types').set(auth)
      .send({ name: 'post', displayName: 'Post', schema: [{ name: 'title', type: 'text', required: true }, { name: 'body', type: 'richtext' }] })
      .expect(201);
    await request(server).post('/api/content-types').set(auth)
      .send({ name: 'author', schema: [{ name: 'name', type: 'text' }] })
      .expect(201);

    const make = async (name: string, permissions: any) => {
      const res = await request(server).post('/api/api-keys').set(auth).send({ name, permissions }).expect(201);
      keys[name] = res.body.key;
    };
    await make('full', { access: 'all', contentTypes: ['*'] });
    await make('write', { access: 'write', contentTypes: ['*'] });
    await make('read', { access: 'read', contentTypes: ['*'] });
    await make('scoped', { access: 'all', contentTypes: ['post'] });

    env = { NODEPRESS_URL: `http://127.0.0.1:${port}`, NODEPRESS_TOKEN: keys.full };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-schema-'));
  });

  afterAll(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    await cleanDatabase(app);
    await app.close();
  });

  describe('API key access to export/import', () => {
    it('lets a full-access key export and import', async () => {
      const server = app.getHttpServer();
      const exp = await request(server).get('/api/content-types/export').set('X-API-Key', keys.full).expect(200);
      expect(exp.body.contentTypes.map((c: any) => c.name)).toEqual(['author', 'post']);
      const dry = await request(server).post('/api/content-types/import').set('X-API-Key', keys.full)
        .send({ contentTypes: exp.body.contentTypes, dryRun: true }).expect(201);
      expect(dry.body).toMatchObject({ dryRun: true, valid: true, toUpdate: 2 });
    });

    it.each(['write', 'read', 'scoped'])('refuses a %s key with 403', async (name) => {
      const server = app.getHttpServer();
      await request(server).get('/api/content-types/export').set('X-API-Key', keys[name]).expect(403);
      await request(server).post('/api/content-types/import').set('X-API-Key', keys[name])
        .send({ contentTypes: [{ name: 'x', schema: [] }], dryRun: true }).expect(403);
    });

    it('still needs credentials, and an admin JWT still works', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/content-types/export').expect(401);
      await request(server).get('/api/content-types/export').set('X-API-Key', 'np_nope').expect(401);
      await request(server).get('/api/content-types/export').set(auth).expect(200);
    });

    it('audits an import made with a key', async () => {
      const server = app.getHttpServer();
      const exp = await request(server).get('/api/content-types/export').set(auth).expect(200);
      await request(server).post('/api/content-types/import').set('X-API-Key', keys.full)
        .send({ contentTypes: exp.body.contentTypes }).expect(201);
      const row = await app.get(PrismaService).auditLog.findFirst({ where: { userEmail: 'api-key:full' } });
      expect(row).toMatchObject({ userId: null, resource: 'content_type' });
    });
  });

  describe('nodepress schema:*', () => {
    const file = () => path.join(dir, 'nodepress.schema.json');

    it('pull → edit → diff (1) → push --yes → diff (0)', async () => {
      const pulled = await cli(['schema:pull'], env, dir);
      expect(pulled.code).toBe(0);
      const text = fs.readFileSync(file(), 'utf8');
      const bundle = JSON.parse(text);
      expect(bundle.exportedAt).toBeUndefined();
      expect(bundle.contentTypes.map((c: any) => c.name)).toEqual(['author', 'post']);
      expect(Object.keys(bundle.contentTypes[1])).toEqual(['name', 'displayName', 'allowedMethods', 'schema']);
      expect(text).toBe(`${JSON.stringify(bundle, null, 2)}\n`);

      // A second pull is byte-identical (clean git diffs).
      expect((await cli(['schema:pull'], env, dir)).code).toBe(0);
      expect(fs.readFileSync(file(), 'utf8')).toBe(text);

      const clean = await cli(['schema:diff'], env, dir);
      expect(clean.code).toBe(0);
      expect(clean.out).toMatch(/In sync/);

      // Edit: add a field to post, drop body, restrict methods; add a new type.
      const post = bundle.contentTypes.find((c: any) => c.name === 'post');
      post.schema = [post.schema[0], { name: 'summary', type: 'textarea' }];
      post.allowedMethods = ['list', 'read'];
      bundle.contentTypes.push({ name: 'tag', displayName: 'Tag', allowedMethods: null, schema: [{ name: 'label', type: 'text' }] });
      fs.writeFileSync(file(), JSON.stringify(bundle, null, 2));

      const changed = await cli(['schema:diff'], env, dir);
      expect(changed.code).toBe(1);
      expect(changed.out).toMatch(/~ post/);
      expect(changed.out).toMatch(/\+ summary/);
      expect(changed.out).toMatch(/- body/);
      expect(changed.out).toMatch(/allowedMethods/);
      expect(changed.out).toMatch(/\+ tag\s+new content type \(1 field\)/);

      // Without --yes and without a terminal, push refuses.
      const refused = await cli(['schema:push'], env, dir);
      expect(refused.code).toBe(1);
      expect(refused.err).toMatch(/--yes/);

      const pushed = await cli(['schema:push', '--yes'], env, dir);
      expect(pushed.code).toBe(0);
      expect(pushed.out).toMatch(/1 created, 1 updated/); // author is unchanged and not sent

      const after = await cli(['schema:diff'], env, dir);
      expect(after.code).toBe(0);

      const server = app.getHttpServer();
      const types = (await request(server).get('/api/content-types').expect(200)).body;
      const live = types.find((c: any) => c.name === 'post');
      expect(live.schema.map((f: any) => f.name)).toEqual(['title', 'summary']);
      expect(live.allowedMethods).toEqual(['list', 'read']);
      expect(types.some((c: any) => c.name === 'tag')).toBe(true);
    });

    it('round-trips other exported collections (components)', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/components').set(auth)
        .send({ name: 'cta', fields: [{ name: 'label', type: 'text' }] }).expect(201);
      expect((await cli(['schema:pull'], env, dir)).code).toBe(0);
      const bundle = JSON.parse(fs.readFileSync(file(), 'utf8'));
      expect(bundle.components.map((c: any) => c.name)).toEqual(['cta']);
      expect((await cli(['schema:diff'], env, dir)).code).toBe(0);

      bundle.components[0].fields.push({ name: 'href', type: 'text' });
      fs.writeFileSync(file(), JSON.stringify(bundle, null, 2));
      const changed = await cli(['schema:diff'], env, dir);
      expect(changed.code).toBe(1);
      expect(changed.out).toMatch(/~ component cta/);
      expect((await cli(['schema:push', '-y'], env, dir)).code).toBe(0);
      expect((await cli(['schema:diff'], env, dir)).code).toBe(0);
      const list = (await request(server).get('/api/components').set(auth).expect(200)).body;
      expect(list[0].fields.map((f: any) => f.name)).toEqual(['label', 'href']);
    });

    it('accepts an admin JWT and --url/--token flags; reports invalid files with exit 2', async () => {
      const viaJwt = await cli(['schema:diff', '--url', env.NODEPRESS_URL, '--token', adminToken], {}, dir);
      expect(viaJwt.code).toBe(0);

      const denied = await cli(['schema:diff'], { ...env, NODEPRESS_TOKEN: keys.read }, dir);
      expect(denied.code).toBe(2);
      expect(denied.err).toMatch(/403/);

      const bad = path.join(dir, 'bad.json');
      fs.writeFileSync(bad, JSON.stringify({ contentTypes: [{ name: 'broken', schema: [{ name: 'x', type: 'nope' }] }] }));
      const invalid = await cli(['schema:diff', '--file', bad], env, dir);
      expect(invalid.code).toBe(2);
      expect(invalid.out).toMatch(/✗ broken/);
      const noPush = await cli(['schema:push', '--file', bad, '--yes'], env, dir);
      expect(noPush.code).toBe(2);
    });
  });
});
