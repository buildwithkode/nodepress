import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Live preview URL (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ctId: number;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('stores previewUrl on create and returns it', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/content-types')
      .set(auth())
      .send({ name: 'blog', schema: [{ name: 'title', type: 'text' }], previewUrl: 'https://site.example/api/draft?token={token}&slug={slug}' })
      .expect(201);
    ctId = res.body.id;
    expect(res.body.previewUrl).toBe('https://site.example/api/draft?token={token}&slug={slug}');

    const one = await request(app.getHttpServer()).get(`/api/content-types/${ctId}`).set(auth()).expect(200);
    expect(one.body.previewUrl).toBe('https://site.example/api/draft?token={token}&slug={slug}');
  });

  it('rejects non-http(s) templates and placeholders in the host', async () => {
    await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ previewUrl: 'javascript:alert(1)' }).expect(400);
    await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ previewUrl: 'https://{slug}.site.example/' }).expect(400);
  });

  it('updates, keeps it when omitted, and clears it with an empty string', async () => {
    let res = await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ previewUrl: 'http://localhost:4321/blog/{slug}?preview={token}&lang={locale}' }).expect(200);
    expect(res.body.previewUrl).toBe('http://localhost:4321/blog/{slug}?preview={token}&lang={locale}');

    res = await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ displayName: 'Blog' }).expect(200);
    expect(res.body.previewUrl).toBe('http://localhost:4321/blog/{slug}?preview={token}&lang={locale}');

    res = await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ previewUrl: '' }).expect(200);
    expect(res.body.previewUrl).toBeNull();
  });

  it('round-trips through schema export/import', async () => {
    await request(app.getHttpServer()).put(`/api/content-types/${ctId}`).set(auth())
      .send({ previewUrl: 'https://site.example/{slug}' }).expect(200);
    const exported = await request(app.getHttpServer()).get('/api/content-types/export').set(auth()).expect(200);
    expect(exported.body.contentTypes.find((c: any) => c.name === 'blog').previewUrl).toBe('https://site.example/{slug}');

    const bundle = {
      contentTypes: [
        { name: 'page', schema: [{ name: 'title', type: 'text' }], previewUrl: 'https://site.example/p/{slug}' },
        // An older bundle without the key leaves the existing value alone.
        { name: 'blog', schema: [{ name: 'title', type: 'text' }] },
      ],
    };
    await request(app.getHttpServer()).post('/api/content-types/import').set(auth()).send(bundle).expect(201);
    const all = await request(app.getHttpServer()).get('/api/content-types').set(auth()).expect(200);
    const list = Array.isArray(all.body) ? all.body : all.body.data;
    expect(list.find((c: any) => c.name === 'page').previewUrl).toBe('https://site.example/p/{slug}');
    expect(list.find((c: any) => c.name === 'blog').previewUrl).toBe('https://site.example/{slug}');

    // An invalid previewUrl fails the whole bundle.
    const bad = await request(app.getHttpServer()).post('/api/content-types/import').set(auth())
      .send({ dryRun: true, contentTypes: [{ name: 'other', schema: [], previewUrl: 'ftp://x/{slug}' }] }).expect(201);
    expect(bad.body.valid).toBe(false);
  });
});
