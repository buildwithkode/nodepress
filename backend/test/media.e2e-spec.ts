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

  it('GET /api/media → returns paginated list without auth', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/media')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1 });
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/media → respects limit query param', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/media')
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
});
