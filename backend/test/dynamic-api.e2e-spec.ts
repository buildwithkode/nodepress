import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Dynamic API (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;
  let apiKey: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);

    // Create a content type for the dynamic API tests
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'article',
        schema: [
          { name: 'title', type: 'text', required: true },
          { name: 'body',  type: 'textarea', required: false },
        ],
      });
    contentTypeId = ctRes.body.id;

    // Create two published entries
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'hello-world', status: 'published', data: { title: 'Hello World', body: 'First article' } });

    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'second-post', status: 'published', data: { title: 'Second Post', body: 'Another article' } });

    // Create a draft entry (should NOT appear in public API)
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'draft-post', status: 'draft', data: { title: 'Draft', body: 'Not published' } });

    // Create an API key for authenticated write tests
    const keyRes = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Key', permissions: { access: 'all', contentTypes: ['*'] } });
    apiKey = keyRes.body.key;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Public list ───────────────────────────────────────────────────────────────

  it('GET /api/article → returns only published entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article')
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.every((e: any) => e.slug !== 'draft-post')).toBe(true);
    expect(res.body.data.some((e: any) => e.slug === 'hello-world')).toBe(true);
  });

  it('GET /api/article → supports pagination', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article')
      .query({ limit: 1, page: 1 })
      .expect(200);

    expect(res.body.data.length).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/article → supports search', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article')
      .query({ search: 'Hello' })
      .expect(200);

    expect(res.body.data.some((e: any) => e.slug === 'hello-world')).toBe(true);
  });

  // ── Public single entry ───────────────────────────────────────────────────────

  it('GET /api/article/:slug → returns the published entry', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article/hello-world')
      .expect(200);

    expect(res.body.slug).toBe('hello-world');
    expect(res.body.data.title).toBe('Hello World');
  });

  it('GET /api/article/:slug → 404 for draft entries', async () => {
    await request(app.getHttpServer())
      .get('/api/article/draft-post')
      .expect(404);
  });

  it('GET /api/article/:slug → 404 for non-existent slug', async () => {
    await request(app.getHttpServer())
      .get('/api/article/does-not-exist')
      .expect(404);
  });

  // ── 404 for unknown content type ──────────────────────────────────────────────

  it('GET /api/unknown-type → 404 for unregistered content type', async () => {
    await request(app.getHttpServer())
      .get('/api/unknown-type')
      .expect(404);
  });

  // ── Write via API key ─────────────────────────────────────────────────────────

  it('POST /api/article → creates entry via API key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/article')
      .set('X-API-Key', apiKey)
      .send({ slug: 'api-key-post', data: { title: 'API Key Post' } })
      .expect(201);

    expect(res.body.slug).toBe('api-key-post');
  });

  it('POST /api/article → 401 without any auth', async () => {
    await request(app.getHttpServer())
      .post('/api/article')
      .send({ slug: 'no-auth', data: { title: 'No Auth' } })
      .expect(401);
  });

  it('PUT /api/article/:slug → updates entry via API key', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/article/api-key-post')
      .set('X-API-Key', apiKey)
      .send({ data: { title: 'Updated via API Key' } })
      .expect(200);

    expect(res.body.data.title).toBe('Updated via API Key');
  });

  it('PUT /api/article/:slug → keeps the fields it does not send; null clears one', async () => {
    const http = () => request(app.getHttpServer());
    await http().post('/api/article').set('X-API-Key', apiKey)
      .send({ slug: 'partial-put', data: { title: 'Partial', body: 'Original body' } }).expect(201);

    const res = await http().put('/api/article/partial-put').set('X-API-Key', apiKey)
      .send({ data: { body: 'New body' } }).expect(200);
    expect(res.body.data).toMatchObject({ title: 'Partial', body: 'New body' });

    const cleared = await http().put('/api/article/partial-put').set('X-API-Key', apiKey)
      .send({ data: { body: null } }).expect(200);
    expect(cleared.body.data.title).toBe('Partial');
    expect(cleared.body.data.body ?? null).toBeNull();
  });

  it('DELETE /api/article/:slug → deletes entry via API key', async () => {
    await request(app.getHttpServer())
      .delete('/api/article/api-key-post')
      .set('X-API-Key', apiKey)
      .expect(200);
  });

  // ── Allowed methods enforcement ───────────────────────────────────────────────

  it('POST /api/article → 403 when create method is disabled', async () => {
    // Restrict the content type to read-only
    await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allowedMethods: ['list', 'read'] });

    await request(app.getHttpServer())
      .post('/api/article')
      .set('X-API-Key', apiKey)
      .send({ slug: 'blocked', data: { title: 'Blocked' } })
      .expect(403);

    // Restore all methods
    await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allowedMethods: null });
  });

  // ── Read-only API key ─────────────────────────────────────────────────────────

  it('POST /api/article → 403 with read-only API key', async () => {
    const readKeyRes = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Read Key', permissions: { access: 'read', contentTypes: ['*'] } });

    await request(app.getHttpServer())
      .post('/api/article')
      .set('X-API-Key', readKeyRes.body.key)
      .send({ slug: 'read-only-attempt', data: { title: 'Should Fail' } })
      .expect(403);
  });

  // ── ?fields projection ────────────────────────────────────────────────────────

  it('GET /api/article?fields=title → returns only the requested field in data', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article')
      .query({ fields: 'title' })
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    res.body.data.forEach((entry: any) => {
      expect(entry.data).toHaveProperty('title');
      // body should be stripped — not present or undefined
      expect(entry.data.body).toBeUndefined();
    });
  });

  it('GET /api/article/:slug?fields=title → single entry projection', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article/hello-world')
      .query({ fields: 'title' })
      .expect(200);

    expect(res.body.data).toHaveProperty('title');
    expect(res.body.data.body).toBeUndefined();
  });

  // ── ?populate (relation) ──────────────────────────────────────────────────────

  it('GET /api/article?populate=author → populate is accepted and does not crash (no relation field)', async () => {
    // article schema has no relation field — populate should be a no-op and return normally
    const res = await request(app.getHttpServer())
      .get('/api/article')
      .query({ populate: 'author' })
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('GET /api/{type}?populate= with relation content type → inlines related entry', async () => {
    // Create a "person" content type
    const personCtRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'person',
        schema: [{ name: 'full_name', type: 'text', required: true }],
      });
    const personCtId = personCtRes.body.id;

    // Create a person entry
    const personRes = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId: personCtId, slug: 'jane-doe', status: 'published', data: { full_name: 'Jane Doe' } });
    const personPublicId = personRes.body.publicId;

    // Create a "post" content type with an author relation
    const postCtRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'relpost',
        schema: [
          { name: 'title',  type: 'text',     required: true },
          { name: 'author', type: 'relation',  options: { cardinality: 'one', contentType: 'person' } },
        ],
      });
    const postCtId = postCtRes.body.id;

    // Create a post entry referencing the person
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId: postCtId, slug: 'my-post', status: 'published', data: { title: 'My Post', author: personPublicId } });

    // Fetch via dynamic API with ?populate=author
    const res = await request(app.getHttpServer())
      .get('/api/relpost/my-post')
      .query({ populate: 'author' })
      .expect(200);

    expect(res.body.data.author).toBeDefined();
    expect(typeof res.body.data.author).toBe('object');
    expect(res.body.data.author.slug).toBe('jane-doe');
  });
  // ── Nested query params (regression: Express 5 "simple" parser ignored them) ──

  it('GET /api/article?where[title][eq]=… → actually filters', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article?where[title][eq]=Hello World')
      .expect(200);

    expect(res.body.data.map((e: any) => e.slug)).toEqual(['hello-world']);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /api/article?filters[title][contains]=… → Strapi-style alias filters too', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/article?filters[title][contains]=Second')
      .expect(200);

    expect(res.body.data.map((e: any) => e.slug)).toEqual(['second-post']);
  });

  // ── Unpublished stages need credentials ───────────────────────────────────

  it('anonymous requests cannot read drafts via ?stage= or the environment header', async () => {
    const server = app.getHttpServer();
    for (const stage of ['draft', 'all', 'staging']) {
      await request(server).get(`/api/article?stage=${stage}`).expect(401);
    }
    await request(server).get('/api/article').set('x-nodepress-environment', 'staging').expect(401);
    await request(server).get('/api/article/draft-post?stage=draft').expect(401);
    // The default (published) stage stays public.
    const pub = await request(server).get('/api/article?stage=published').expect(200);
    expect(pub.body.data.map((e: any) => e.slug)).not.toContain('draft-post');
  });

  it('a logged-in user or a scoped API key can read drafts, and the response is never publicly cacheable', async () => {
    const server = app.getHttpServer();
    const withJwt = await request(server).get('/api/article?stage=draft').set('Authorization', `Bearer ${token}`).expect(200);
    expect(withJwt.body.data.map((e: any) => e.slug)).toContain('draft-post');
    expect(withJwt.headers['cache-control']).toBe('private, no-store');

    const withKey = await request(server).get('/api/article/draft-post?stage=draft').set('X-API-Key', apiKey).expect(200);
    expect(withKey.body.slug).toBe('draft-post');

    await request(server).get('/api/article?stage=draft').set('Authorization', 'Bearer not-a-token').expect(401);
  });

  // ── Cache invalidation across write paths ─────────────────────────────────

  it('an admin-panel edit is visible on the cached public API immediately', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'cache-check', status: 'published', data: { title: 'Before' } })
      .expect(201);

    // Prime the public cache
    const before = await request(app.getHttpServer()).get('/api/article/cache-check').expect(200);
    expect(before.body.data.title).toBe('Before');

    await request(app.getHttpServer())
      .put(`/api/entries/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { title: 'After' } })
      .expect(200);

    const after = await request(app.getHttpServer()).get('/api/article/cache-check').expect(200);
    expect(after.body.data.title).toBe('After');

    await request(app.getHttpServer())
      .delete(`/api/entries/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer()).get('/api/article/cache-check').expect(404);
  });

  it('a write clears only its own content type from the public cache', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const other = await request(server)
      .post('/api/content-types')
      .set(auth)
      .send({ name: 'note', schema: [{ name: 'title', type: 'text' }] })
      .expect(201);
    const art = await request(server)
      .post('/api/entries')
      .set(auth)
      .send({ contentTypeId, slug: 'scoped', status: 'published', data: { title: 'Cached' } })
      .expect(201);
    const note = await request(server)
      .post('/api/entries')
      .set(auth)
      .send({ contentTypeId: other.body.id, slug: 'n1', status: 'draft', data: { title: 'Note' } })
      .expect(201);

    // Prime the article cache, then change the row behind Prisma's back (raw SQL
    // skips the invalidation middleware), so a cache hit still shows "Cached".
    await request(server).get('/api/article/scoped').expect(200);
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      `UPDATE "entries" SET "data" = '{"title":"Changed"}' WHERE "id" = ${Number(art.body.id)}`,
    );

    // A bulk publish of a note must not clear the article cache…
    await request(server).post('/api/entries/bulk-publish').set(auth).send({ ids: [note.body.id] }).expect(201);
    await request(server).get('/api/note/n1').expect(200);
    const stillCached = await request(server).get('/api/article/scoped').expect(200);
    expect(stillCached.body.data.title).toBe('Cached');

    // …while a bulk write to the article clears it.
    await request(server).post('/api/entries/bulk-publish').set(auth).send({ ids: [art.body.id] }).expect(201);
    const fresh = await request(server).get('/api/article/scoped').expect(200);
    expect(fresh.body.data.title).toBe('Changed');
  });

  // ── Indexed fields ────────────────────────────────────────────────────────

  it('indexed: true builds a partial expression index; removing the flag drops it', async () => {
    const prisma = app.get(PrismaService);
    const indexName = `entries_f_${contentTypeId}_title`;
    const indexExists = async () =>
      (await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM pg_indexes WHERE indexname = '${indexName}'`)).length > 0;
    const waitFor = async (want: boolean) => {
      for (let i = 0; i < 50 && (await indexExists()) !== want; i++) await new Promise((r) => setTimeout(r, 100));
      return indexExists();
    };

    await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schema: [{ name: 'title', type: 'text', required: true, indexed: true }, { name: 'body', type: 'textarea' }] })
      .expect(200);
    expect(await waitFor(true)).toBe(true);

    await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schema: [{ name: 'title', type: 'text', required: true }, { name: 'body', type: 'textarea' }] })
      .expect(200);
    expect(await waitFor(false)).toBe(false);
  });

  it('indexed: true is rejected on fields that cannot be indexed', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schema: [{ name: 'title', type: 'text', required: true }, { name: 'body', type: 'richtext', indexed: true }] })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('indexed');
  });
});
