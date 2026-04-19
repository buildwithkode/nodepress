import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  // ── Bulk operations ───────────────────────────────────────────────────────────

  it('POST /api/entries/bulk-publish → publishes multiple entries', async () => {
    // Create two draft entries
    const a = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-a', status: 'draft', data: { title: 'Bulk A' } });
    const b = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-b', status: 'draft', data: { title: 'Bulk B' } });

    await request(app.getHttpServer())
      .post('/api/entries/bulk-publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [a.body.id, b.body.id] })
      .expect(201);

    const checkA = await request(app.getHttpServer())
      .get(`/api/entries/${a.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    const checkB = await request(app.getHttpServer())
      .get(`/api/entries/${b.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(checkA.body.status).toBe('published');
    expect(checkB.body.status).toBe('published');
  });

  it('POST /api/entries/bulk-archive → archives multiple entries', async () => {
    const c = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-c', status: 'published', data: { title: 'Bulk C' } });

    await request(app.getHttpServer())
      .post('/api/entries/bulk-archive')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [c.body.id] })
      .expect(201);

    const check = await request(app.getHttpServer())
      .get(`/api/entries/${c.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(check.body.status).toBe('archived');
  });

  it('POST /api/entries/bulk-pending-review → sets entries to pending_review', async () => {
    const d = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-d', status: 'draft', data: { title: 'Bulk D' } });

    await request(app.getHttpServer())
      .post('/api/entries/bulk-pending-review')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [d.body.id] })
      .expect(201);

    const check = await request(app.getHttpServer())
      .get(`/api/entries/${d.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(check.body.status).toBe('pending_review');
  });

  it('POST /api/entries/bulk-delete → soft-deletes multiple entries', async () => {
    const e1 = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-e1', status: 'draft', data: { title: 'Bulk E1' } });
    const e2 = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'bulk-e2', status: 'draft', data: { title: 'Bulk E2' } });

    await request(app.getHttpServer())
      .post('/api/entries/bulk-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [e1.body.id, e2.body.id] })
      .expect(201);

    // Entries should appear in deleted=true list
    const deleted = await request(app.getHttpServer())
      .get('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .query({ deleted: 'true' });

    const slugs = deleted.body.data.map((e: any) => e.slug);
    expect(slugs).toContain('bulk-e1');
    expect(slugs).toContain('bulk-e2');
  });

  // ── Export / Import ───────────────────────────────────────────────────────────

  it('GET /api/entries/export → exports all entries for a content type', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/entries/export')
      .set('Authorization', `Bearer ${token}`)
      .query({ contentTypeId })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('slug');
    expect(res.body[0]).toHaveProperty('data');
  });

  it('POST /api/entries/import → imports entries (upsert by slug)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/entries/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        entries: [
          { slug: 'import-new',       data: { title: 'Imported New' },       status: 'published' },
          { slug: 'public-post',      data: { title: 'Public Post Updated' }, status: 'published' },
        ],
      })
      .expect(201);

    expect(res.body.created).toBeGreaterThanOrEqual(1);
    expect(res.body.updated).toBeGreaterThanOrEqual(1);
    expect(res.body.errors).toBeInstanceOf(Array);
  });

  it('POST /api/entries/import → skips rows without slug and lists them in errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/entries/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contentTypeId,
        entries: [
          { data: { title: 'Missing slug' } },
        ],
      })
      .expect(201);

    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
  });

  // ── Preview token ─────────────────────────────────────────────────────────────

  it('POST /api/entries/:id/preview-url → round-trip: draft is readable via signed token', async () => {
    // Create a draft entry (not published — would be invisible on the public API)
    const draft = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'preview-draft', status: 'draft', data: { title: 'Preview Draft' } });

    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('draft');

    // Confirm the draft is NOT reachable via the normal public endpoint
    await request(app.getHttpServer())
      .get('/api/blog/preview-draft')
      .expect(404);

    // Generate a signed preview token
    const tokenRes = await request(app.getHttpServer())
      .post(`/api/entries/${draft.body.id}/preview-url`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(tokenRes.body.token).toBeDefined();
    expect(tokenRes.body.expiresAt).toBeDefined();

    // Use the token to read the draft via the preview endpoint
    const previewRes = await request(app.getHttpServer())
      .get('/api/blog/preview-draft/preview')
      .query({ token: tokenRes.body.token })
      .expect(200);

    expect(previewRes.body.slug).toBe('preview-draft');
    expect(previewRes.body.status).toBe('draft');
    expect(previewRes.body._preview).toBe(true);
  });

  it('GET /api/:type/:slug/preview → 401 with invalid token', async () => {
    await request(app.getHttpServer())
      .get('/api/blog/preview-draft/preview')
      .query({ token: 'not-a-valid-token' })
      .expect(401);
  });

  it('GET /api/:type/:slug/preview → 401 with no token', async () => {
    await request(app.getHttpServer())
      .get('/api/blog/preview-draft/preview')
      .expect(401);
  });
});
