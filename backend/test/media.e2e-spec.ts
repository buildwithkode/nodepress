import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

// Minimal valid 1×1 PNG (67 bytes) — passes magic-bytes MIME validation
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Media (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let uploadedFilename: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Upload ────────────────────────────────────────────────────────────────────

  it('POST /api/media/upload → uploads an image and returns metadata', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', MINIMAL_PNG, { filename: 'test.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.url).toBeDefined();
    expect(res.body.mimetype).toContain('image');
    expect(res.body.filename).toBeDefined();
    uploadedFilename = res.body.filename;
  });

  it('POST /api/media/upload → 401 without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/media/upload')
      .attach('file', MINIMAL_PNG, { filename: 'test.png', contentType: 'image/png' })
      .expect(401);
  });

  it('POST /api/media/upload → 400 when no file attached', async () => {
    await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  // ── List ─────────────────────────────────────────────────────────────────────

  it('GET /api/media → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/api/media').expect(401);
  });

  it('GET /api/media → returns paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1 });
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/media → respects limit query param', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .query({ limit: 1 })
      .expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.meta.limit).toBe(1);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/media/:filename → 401 without authentication', async () => {
    await request(app.getHttpServer())
      .delete(`/api/media/${uploadedFilename}`)
      .expect(401);
  });

  it('DELETE /api/media/:filename → deletes the file', async () => {
    await request(app.getHttpServer())
      .delete(`/api/media/${uploadedFilename}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('DELETE /api/media/:filename → 404 for non-existent file', async () => {
    await request(app.getHttpServer())
      .delete('/api/media/does-not-exist.png')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── On-the-fly transforms & focal point ──────────────────────────────────

  it('transforms an uploaded image with snapped sizes and a focal-point crop', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    // 800×400: left half red, right half blue.
    const half = (r: number, b: number) =>
      sharp({ create: { width: 400, height: 400, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
    const img = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: await half(255, 0), left: 0, top: 0 }, { input: await half(0, 255), left: 400, top: 0 }])
      .png().toBuffer();

    const up = await request(app.getHttpServer())
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', img, { filename: 'split.png', contentType: 'image/png' })
      .expect(201);
    const file = up.body.filename;

    const resized = await request(app.getHttpServer())
      .get(`/api/media/${file}/transform?w=150&format=auto`)
      .set('Accept', 'image/avif,image/webp,*/*')
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })
      .expect(200);
    expect(resized.headers['content-type']).toBe('image/avif');
    expect(resized.headers.vary).toBe('Accept');
    expect((await sharp(resized.body).metadata()).width).toBe(192);

    await request(app.getHttpServer()).put(`/api/media/${file}/focal-point`).send({ x: 0.9, y: 0.5 }).expect(401);
    const focal = await request(app.getHttpServer())
      .put(`/api/media/${file}/focal-point`)
      .set('Authorization', `Bearer ${token}`)
      .send({ x: 0.9, y: 0.5 })
      .expect(200);
    expect(focal.body).toMatchObject({ focalX: 0.9, focalY: 0.5 });

    const crop = await request(app.getHttpServer())
      .get(`/api/media/${file}/transform?w=64&h=64&fit=cover&format=png&fp=0.9,0.5`)
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })
      .expect(200);
    expect(crop.headers['cache-control']).toContain('immutable');
    const { data } = await sharp(crop.body).raw().toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(200); // blue side kept
    expect(data[0]).toBeLessThan(50);

    await request(app.getHttpServer()).delete(`/api/media/${file}`).set('Authorization', `Bearer ${token}`).expect(200);
  });
});
