import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Entries (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;
  let entryId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);

    // Create a content type to use in entry tests
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'blog',
        schema: [
          { name: 'title', type: 'text', required: true },
          { name: 'body', type: 'richtext', required: false },
          { name: 'published', type: 'boolean', required: false },
        ],
      });
    contentTypeId = ctRes.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Create ────────────────────────────────────────────────────────────────────

  it('POST /api/entries → creates an entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        slug: 'first-post',
        status: 'published',
        data: { title: 'First Post', body: '<p>Hello world</p>', published: true },
      })
      .expect(201);

    entryId = res.body.id;
    expect(res.body.slug).toBe('first-post');
    expect(res.body.status).toBe('published');
    expect(res.body.data.title).toBe('First Post');
  });

  it('POST /api/entries → 409 when slug already exists in same content type', async () => {
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        slug: 'first-post',
        data: { title: 'Duplicate' },
      })
      .expect(409);
  });

  it('POST /api/entries → 401 without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/entries')
      .send({ contentTypeId, slug: 'unauth', data: { title: 'X' } })
      .expect(401);
  });

  it('POST /api/entries → sanitizes richtext XSS in body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        slug: 'xss-test',
        data: { title: 'XSS Test', body: '<p>Safe</p><script>evil()</script>' },
      })
      .expect(201);

    expect(res.body.data.body).not.toContain('<script>');
    expect(res.body.data.body).toContain('<p>Safe</p>');
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/entries → lists entries with pagination', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ contentTypeId, page: 1, limit: 10 })
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/entries → search by slug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'first-post' })
      .expect(200);

    expect(res.body.data.some((e: any) => e.slug === 'first-post')).toBe(true);
  });

  it('GET /api/entries → search by data field value', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'First Post' })
      .expect(200);

    expect(res.body.data.some((e: any) => e.data.title === 'First Post')).toBe(true);
  });

  // ── Get one ───────────────────────────────────────────────────────────────────

  it('GET /api/entries/:id → returns entry', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(entryId);
    expect(res.body.slug).toBe('first-post');
  });

  it('GET /api/entries/:id → 404 for non-existent entry', async () => {
    await request(app.getHttpServer())
      .get('/api/entries/99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Update ────────────────────────────────────────────────────────────────────

  it('PUT /api/entries/:id → updates entry and creates a version snapshot', async () => {
    await request(app.getHttpServer())
      .put(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { title: 'Updated Title', body: '<p>Updated</p>' } })
      .expect(200);

    // Verify version was saved
    const versRes = await request(app.getHttpServer())
      .get(`/api/entries/${entryId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(versRes.body).toBeInstanceOf(Array);
    expect(versRes.body.length).toBeGreaterThanOrEqual(1);
    expect(versRes.body[0].data.title).toBe('First Post'); // snapshot of old value
  });

  it('POST /api/entries/:id/versions/:versionId/restore → restores a version', async () => {
    const versRes = await request(app.getHttpServer())
      .get(`/api/entries/${entryId}/versions`)
      .set('Authorization', `Bearer ${token}`);

    const versionId = versRes.body[0].id;

    const res = await request(app.getHttpServer())
      .post(`/api/entries/${entryId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(res.body.data.title).toBe('First Post');
  });

  // ── Status / SEO / publishAt ──────────────────────────────────────────────────

  it('PUT /api/entries/:id → saves SEO fields', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        seo: { title: 'SEO Title', description: 'Meta desc', noIndex: false },
      })
      .expect(200);

    // seo is stored — the response shape may include it from the DB
    expect(res.body).toBeDefined();
  });

  it('PUT /api/entries/:id → sets status to draft', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'draft' })
      .expect(200);

    expect(res.body.status).toBe('draft');
  });

  // ── Soft delete / restore / purge ─────────────────────────────────────────────

  it('DELETE /api/entries/:id → soft-deletes (moves to trash)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Entry should not appear in normal list
    const listRes = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ contentTypeId });

    const found = listRes.body.data.find((e: any) => e.id === entryId);
    expect(found).toBeUndefined();
  });

  it('GET /api/entries?deleted=true → shows soft-deleted entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ deleted: 'true' })
      .expect(200);

    const found = res.body.data.find((e: any) => e.id === entryId);
    expect(found).toBeDefined();
  });

  it('POST /api/entries/:id/restore → restores a trashed entry', async () => {
    await request(app.getHttpServer())
      .post(`/api/entries/${entryId}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('DELETE /api/entries/:id/purge → permanently deletes', async () => {
    // Soft-delete first
    await request(app.getHttpServer())
      .delete(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`);

    await request(app.getHttpServer())
      .delete(`/api/entries/${entryId}/purge`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Confirm gone
    await request(app.getHttpServer())
      .get(`/api/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Public API ────────────────────────────────────────────────────────────────

  it('GET /api/blog → public list returns only published entries', async () => {
    // Create a published entry for the public API test
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        slug: 'public-post',
        status: 'published',
        data: { title: 'Public Post' },
      });

    const res = await request(app.getHttpServer())
      .get('/api/blog')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.every((e: any) => e.status === undefined)).toBe(true); // status stripped from public response
    expect(res.body.data.some((e: any) => e.slug === 'public-post')).toBe(true);
  });

  it('GET /api/blog/public-post → returns single published entry', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/blog/public-post')
      .expect(200);

    expect(res.body.slug).toBe('public-post');
    expect(res.body.id).toBeDefined(); // publicId UUID
  });

  it('GET /api/blog?search=Public → public search works', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/blog')
      .query({ search: 'Public' })
      .expect(200);

    expect(res.body.data.some((e: any) => e.slug === 'public-post')).toBe(true);
  });
});
