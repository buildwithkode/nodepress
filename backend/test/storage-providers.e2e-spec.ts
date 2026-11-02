import { INestApplication } from '@nestjs/common';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import sharp from 'sharp';
import { cleanDatabase, createTestApp, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { seal } from '../src/common/secret-box';

const ACCOUNT = 'a'.repeat(32);
const STORAGE_ENV = [
  'STORAGE_DRIVER', 'STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY', 'STORAGE_S3_SECRET_KEY', 'STORAGE_S3_ENDPOINT',
  'STORAGE_S3_PUBLIC_URL', 'STORAGE_R2_ACCOUNT_ID', 'STORAGE_IMAGEKIT_PRIVATE_KEY', 'STORAGE_IMAGEKIT_URL_ENDPOINT', 'STORAGE_IMAGEKIT_FOLDER',
];
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#0af' } }).png().toBuffer();

describe('Storage providers (e2e)', () => {
  let app: INestApplication | null = null;
  let token: string;
  const saved = new Map<string, string | undefined>();
  const server = () => request(app!.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  // Registering is rate limited, so one admin and token serve every boot in this file.
  const signIn = async () => {
    if (token) return;
    await cleanDatabase(app!);
    token = await registerAdmin(app!);
  };

  const boot = async (env: Record<string, string> = {}, storage: unknown = null) => {
    Object.assign(process.env, env);
    app = await createTestApp();
    await signIn();
    await app.get(PrismaService).setting.upsert({ where: { id: 1 }, update: { storage: storage as any }, create: { id: 1, storage: storage as any } });
  };
  /** Settings saved in the admin are read when the app starts. */
  const bootSaved = async (storage: unknown) => {
    const first = await createTestApp();
    await first.get(PrismaService).setting.upsert({ where: { id: 1 }, update: { storage: storage as any }, create: { id: 1, storage: storage as any } });
    await first.close();
    app = await createTestApp();
    await signIn();
  };

  beforeEach(() => {
    for (const k of STORAGE_ENV) { saved.set(k, process.env[k]); delete process.env[k]; }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) {
      await app.get(PrismaService).setting.updateMany({ data: { storage: null as any } });
      await app.close();
      app = null;
    }
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  /** Answers ImageKit's API, leaving every other request alone. */
  const fakeImageKit = () => {
    const calls: { url: string; method: string; form?: FormData; auth?: string }[] = [];
    const real = global.fetch;
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
      const url = String(input);
      if (!/^https:\/\/(upload|api)\.imagekit\.io\//.test(url)) return real(input, init);
      const method = init.method ?? 'GET';
      calls.push({ url, method, form: init.body instanceof FormData ? init.body : undefined, auth: init.headers?.Authorization });
      if (method === 'POST') return new Response(JSON.stringify({ fileId: 'file-1', url: 'https://ik.imagekit.io/acme/site/x' }), { status: 200 });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      const name = /name = "([^"]+)"/.exec(new URL(url).searchParams.get('searchQuery') ?? '')?.[1];
      return new Response(JSON.stringify([{ fileId: `id-${name}`, name, filePath: `/site/${name}` }]), { status: 200 });
    });
    return calls;
  };

  it('STORAGE_DRIVER=imagekit: the media library uploads and deletes through ImageKit', async () => {
    await boot({ STORAGE_DRIVER: 'imagekit', STORAGE_IMAGEKIT_PRIVATE_KEY: 'private_k', STORAGE_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/acme', STORAGE_IMAGEKIT_FOLDER: 'site' });
    const calls = fakeImageKit();

    const res = await server().post('/api/media/upload').set(auth()).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
    expect(res.body.url).toBe(`https://ik.imagekit.io/acme/site/${res.body.filename}`);
    const uploads = calls.filter((c) => c.method === 'POST');
    expect(uploads.map((c) => c.form!.get('fileName'))).toContain(res.body.filename);
    expect(uploads[0].form!.get('folder')).toBe('/site');
    expect(uploads[0].auth).toBe(`Basic ${Buffer.from('private_k:').toString('base64')}`);

    await server().delete(`/api/media/${res.body.filename}`).set(auth()).expect(200);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/id-${res.body.filename}`))).toBe(true);

    const settings = await server().get('/api/server-settings').set(auth()).expect(200);
    expect(settings.body.storage).toMatchObject({ source: 'env', driver: 'imagekit', active: 'imagekit', hasSecret: true, urlEndpoint: 'https://ik.imagekit.io/acme' });
    expect(JSON.stringify(settings.body)).not.toContain('private_k');
  });

  it('saved ImageKit settings are used at boot', async () => {
    await bootSaved({ driver: 'imagekit', urlEndpoint: 'https://ik.imagekit.io/acme', folder: 'site', secretKey: seal('private_k') });
    const calls = fakeImageKit();
    const res = await server().post('/api/media/upload').set(auth()).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
    expect(res.body.url).toContain('https://ik.imagekit.io/acme/site/');
    expect(calls.length).toBeGreaterThan(0);
    const settings = await server().get('/api/server-settings').set(auth()).expect(200);
    expect(settings.body.storage).toMatchObject({ source: 'database', driver: 'imagekit', active: 'imagekit', restartRequired: false });
  });

  it('STORAGE_DRIVER=r2: uploads over the S3 API with no ACL, and links use the public URL', async () => {
    const requests: { method: string; url: string; headers: http.IncomingHttpHeaders }[] = [];
    const fakeS3 = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        requests.push({ method: req.method!, url: req.url!, headers: req.headers });
        res.writeHead(200, { ETag: '"abc"' });
        res.end();
      });
    });
    await new Promise<void>((r) => fakeS3.listen(0, '127.0.0.1', r));
    try {
      await boot({
        STORAGE_DRIVER: 'r2',
        STORAGE_S3_BUCKET: 'media',
        STORAGE_S3_ACCESS_KEY: 'key',
        STORAGE_S3_SECRET_KEY: 'secret',
        STORAGE_S3_ENDPOINT: `http://127.0.0.1:${(fakeS3.address() as AddressInfo).port}`,
        STORAGE_S3_PUBLIC_URL: 'https://media.example.com/',
      });
      const res = await server().post('/api/media/upload').set(auth()).attach('file', await png(), { filename: 'a.png', contentType: 'image/png' }).expect(201);
      expect(res.body.url).toBe(`https://media.example.com/${res.body.filename}`);
      const put = requests.find((r) => r.method === 'PUT' && r.url.includes(res.body.filename));
      expect(put?.url).toContain(`/media/${res.body.filename}`);
      expect(put?.headers['x-amz-acl']).toBeUndefined();
      expect(put?.headers.authorization).toContain('/auto/s3/');
    } finally {
      await new Promise((r) => fakeS3.close(r));
    }
  });

  describe('settings', () => {
    const r2 = { driver: 'r2', accountId: ACCOUNT, bucket: 'media', accessKey: 'key', secretKey: 'secret', publicUrl: 'https://media.example.com' };
    const imageKit = { driver: 'imagekit', urlEndpoint: 'https://ik.imagekit.io/acme/', secretKey: 'private_k', folder: '/site/' };
    const put = (body: object) => server().put('/api/server-settings/storage').set(auth()).send(body);

    it('saves R2, needs a restart, and hides the secret', async () => {
      await boot();
      const res = await put(r2).expect(200);
      expect(res.body.storage).toMatchObject({ source: 'database', driver: 'r2', accountId: ACCOUNT, bucket: 'media', hasSecret: true, active: 'local', restartRequired: true });
      expect(JSON.stringify(res.body)).not.toContain('secret"');
    });

    it('refuses R2 without a public URL or with a bad account id', async () => {
      await boot();
      const { publicUrl: _omit, ...noUrl } = r2;
      await put(noUrl).expect(400);
      await put({ ...r2, accountId: 'evil.example.com/x' }).expect(400);
    });

    it('saves ImageKit, tidied, and refuses http or climbing folders', async () => {
      await boot();
      const res = await put(imageKit).expect(200);
      expect(res.body.storage).toMatchObject({ driver: 'imagekit', urlEndpoint: 'https://ik.imagekit.io/acme', folder: 'site', hasSecret: true, restartRequired: true });
      await put({ ...imageKit, urlEndpoint: 'http://ik.imagekit.io/acme' }).expect(400);
      await put({ ...imageKit, folder: 'a/../b' }).expect(400);
    });

    it('a saved S3 secret carries over to R2 but never to ImageKit', async () => {
      await boot();
      await put({ driver: 's3', bucket: 'b', accessKey: 'k', secretKey: 'the-s3-secret' }).expect(200);
      const { secretKey: _r2, ...r2NoSecret } = r2;
      expect((await put(r2NoSecret).expect(200)).body.storage.hasSecret).toBe(true);
      const { secretKey: _ik, ...ikNoSecret } = imageKit;
      expect((await put(ikNoSecret).expect(200)).body.storage.hasSecret).toBe(false);
    });

    it('test connection reaches ImageKit and reports failures', async () => {
      await boot();
      const calls = fakeImageKit();
      await server().post('/api/server-settings/storage/test').set(auth()).send({ ...imageKit, urlEndpoint: 'https://media.example.com' }).expect(200);
      expect(calls.map((c) => c.method)).toEqual(['POST', 'DELETE']);

      jest.restoreAllMocks();
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Your account cannot be authenticated.' }), { status: 401 }));
      const bad = await server().post('/api/server-settings/storage/test').set(auth()).send(imageKit).expect(400);
      expect(bad.body.message).toMatch(/Storage test failed.*cannot be authenticated/);
      expect(bad.body.message).not.toContain('private_k');
    });

    it('asks for the key when none is entered or saved', async () => {
      await boot();
      const { secretKey: _s, ...noSecret } = imageKit;
      const res = await server().post('/api/server-settings/storage/test').set(auth()).send(noSecret).expect(400);
      expect(res.body.message).toMatch(/private key/i);
    });
  });
});
