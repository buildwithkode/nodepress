import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { env } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedirectsService } from '../src/redirects/redirects.service';

describe('Redirects (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let viewerToken: string;
  let ctId: number;

  const http = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const resolve = (path: string) => http().get('/api/redirects/resolve').query({ path });
  const create = (body: Record<string, any>) => http().post('/api/redirects').set(auth()).send(body);
  const all = async () => (await http().get('/api/redirects?limit=200&sort=from').set(auth()).expect(200)).body.data
    .map((r: any) => `${r.from} -> ${r.to} ${r.statusCode}`);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    viewerToken = (await inviteUser(app, token, 'viewer@test.com', 'viewer')).token;
    ctId = (await http().post('/api/content-types').set(auth())
      .send({ name: 'blog_post', schema: [{ name: 'title', type: 'text' }] }).expect(201)).body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  beforeEach(async () => {
    await app.get(PrismaService).redirect.deleteMany();
    await app.get(RedirectsService).clearCache();
  });

  it('needs an editor or admin for management, but resolve is public', async () => {
    await http().get('/api/redirects').expect(401);
    await http().get('/api/redirects').set(auth(viewerToken)).expect(403);
    await http().post('/api/redirects').set(auth(viewerToken)).send({ from: '/a', to: '/b' }).expect(403);
    await resolve('/nowhere').expect(404);
  });

  it('creates, normalizes, resolves, updates and deletes', async () => {
    const r = (await create({ from: 'https://old.example.com/Old-Page/', to: '/new-page' }).expect(201)).body;
    expect(r).toMatchObject({ from: '/old-page', to: '/new-page', statusCode: 301, hits: 0 });

    const hit = await resolve('/OLD-page/').expect(200);
    expect(hit.body).toEqual({ to: '/new-page', statusCode: 301 });
    expect(hit.headers['cache-control']).toBe('public, max-age=60');
    // A redirect without a query matches any query, which is carried over.
    expect((await resolve('/old-page?utm=x').expect(200)).body.to).toBe('/new-page?utm=x');

    await create({ from: '/old-page', to: '/x' }).expect(409);

    const updated = (await http().patch(`/api/redirects/${r.id}`).set(auth()).send({ to: 'https://example.com/n', statusCode: 308 }).expect(200)).body;
    expect(updated).toMatchObject({ to: 'https://example.com/n', statusCode: 308 });
    expect((await resolve('/old-page').expect(200)).body).toEqual({ to: 'https://example.com/n', statusCode: 308 }); // cache cleared

    await http().delete(`/api/redirects/${r.id}`).set(auth()).expect(200);
    await resolve('/old-page').expect(404);
  });

  it('a redirect with a query string matches only that query', async () => {
    await create({ from: '/p?id=7', to: '/products/seven', statusCode: 302 }).expect(201);
    expect((await resolve('/p?id=7').expect(200)).body).toEqual({ to: '/products/seven', statusCode: 302 });
    await resolve('/p?id=8').expect(404);
    await resolve('/p').expect(404);
  });

  it('410 has no target', async () => {
    const gone = (await create({ from: '/gone', to: '/ignored', statusCode: 410 }).expect(201)).body;
    expect(gone.to).toBe('');
    expect((await resolve('/gone').expect(200)).body).toEqual({ to: null, statusCode: 410 });
  });

  it('validates targets and status codes', async () => {
    await create({ from: '/a' }).expect(400);
    await create({ from: '/a', to: 'javascript:alert(1)' }).expect(400);
    await create({ from: '/a', to: '//evil.example' }).expect(400);
    await create({ from: '/a', to: '/b', statusCode: 200 }).expect(400);
  });

  it('refuses loops and chains longer than 5', async () => {
    await create({ from: '/a', to: '/b' }).expect(201);
    const loop = await create({ from: '/b', to: '/a' }).expect(400);
    expect(loop.body.message).toMatch(/loop/);
    await create({ from: '/self', to: '/SELF/' }).expect(400);

    for (const [from, to] of [['/b', '/c'], ['/c', '/d'], ['/d', '/e'], ['/e', '/f']]) await create({ from, to }).expect(201);
    const long = await create({ from: '/f', to: '/g' }).expect(400);
    expect(long.body.message).toMatch(/chain of 6/);
    // …and through an update too.
    const e = (await http().get('/api/redirects?search=/e').set(auth())).body.data.find((r: any) => r.from === '/e');
    await http().patch(`/api/redirects/${e.id}`).set(auth()).send({ to: '/a' }).expect(400);
  });

  it('counts hits without writing on the request path', async () => {
    const r = (await create({ from: '/counted', to: '/target' }).expect(201)).body;
    await resolve('/counted').expect(200);
    await resolve('/counted?x=1').expect(200);
    const prisma = app.get(PrismaService);
    expect((await prisma.redirect.findUnique({ where: { id: r.id } }))!.hits).toBe(0);
    await app.get(RedirectsService).flushHits();
    const after = (await prisma.redirect.findUnique({ where: { id: r.id } }))!;
    expect(after.hits).toBe(2);
    expect(after.lastHitAt).toBeTruthy();
  });

  it('imports CSV (dry run, then all or nothing) and exports it', async () => {
    await create({ from: '/existing', to: '/one' }).expect(201);
    const csv = 'from,to,status\n/existing,/two,302\n/fresh,https://example.com/,301\n/gone,,410\n';

    const dry = (await http().post('/api/redirects/import').set(auth()).send({ csv, dryRun: true }).expect(201)).body;
    expect(dry).toMatchObject({ dryRun: true, total: 3, created: 2, updated: 1, unchanged: 0, errors: [], applied: false });
    expect(await all()).toEqual(['/existing -> /one 301']);

    const bad = (await http().post('/api/redirects/import').set(auth())
      .send({ csv: csv + '/x,/y,999\n/l1,/l2\n/l2,/l1\n' }).expect(201)).body;
    expect(bad.applied).toBe(false);
    expect(bad.errors.map((e: any) => e.line)).toEqual([5, 6, 7]); // the bad status, and both ends of the loop
    expect(await all()).toEqual(['/existing -> /one 301']);

    const done = (await http().post('/api/redirects/import').set(auth()).send({ csv }).expect(201)).body;
    expect(done).toMatchObject({ applied: true, created: 2, updated: 1 });
    expect(await all()).toEqual(['/existing -> /two 302', '/fresh -> https://example.com/ 301', '/gone ->  410']);
    expect((await resolve('/existing').expect(200)).body).toEqual({ to: '/two', statusCode: 302 });

    const exported = await http().get('/api/redirects/export').set(auth()).expect(200);
    expect(exported.headers['content-type']).toMatch(/text\/csv/);
    expect(exported.text.split('\r\n')[0]).toBe('from,to,status,hits,last_hit_at');
    expect(exported.text).toContain('/fresh,https://example.com/,301,0,');

    // An export imports back unchanged.
    const again = (await http().post('/api/redirects/import').set(auth()).send({ csv: exported.text, dryRun: true }).expect(201)).body;
    expect(again).toMatchObject({ total: 3, unchanged: 3, errors: [] });
  });

  it('lists with search and pagination', async () => {
    for (let i = 1; i <= 3; i++) await create({ from: `/list-${i}`, to: `/to-${i}` }).expect(201);
    await create({ from: '/other', to: '/zzz' }).expect(201);
    const page = (await http().get('/api/redirects?search=list&limit=2&page=2').set(auth()).expect(200)).body;
    expect(page.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
    expect(page.data).toHaveLength(1);
  });

  describe('slug changes', () => {
    const newEntry = async (slug: string, status: string, locale?: string) =>
      (await http().post('/api/entries').set(auth())
        .send({ contentTypeId: ctId, slug, status, data: { title: slug }, ...(locale ? { locale } : {}) }).expect(201)).body.id as number;
    const rename = (id: number, slug: string, extra: Record<string, any> = {}) =>
      http().put(`/api/entries/${id}`).set(auth()).send({ slug, ...extra }).expect(200);

    it('adds a 301 from the old public path of a published entry', async () => {
      const id = await newEntry('first-title', 'published');
      await rename(id, 'second-title');
      expect((await resolve('/blog-post/first-title').expect(200)).body).toEqual({ to: '/blog-post/second-title', statusCode: 301 });

      // Renaming again re-points the old redirect instead of chaining.
      await rename(id, 'third-title');
      expect(await all()).toEqual([
        '/blog-post/first-title -> /blog-post/third-title 301',
        '/blog-post/second-title -> /blog-post/third-title 301',
      ]);

      // Going back to an old slug removes the redirect away from it.
      await rename(id, 'first-title');
      expect(await all()).toEqual([
        '/blog-post/second-title -> /blog-post/first-title 301',
        '/blog-post/third-title -> /blog-post/first-title 301',
      ]);
      await resolve('/blog-post/first-title').expect(404);
    });

    it('skips drafts that were never published, but not ones that were', async () => {
      const draft = await newEntry('never-live', 'draft');
      await rename(draft, 'still-not-live');
      expect(await all()).toEqual([]);

      const unpublished = await newEntry('was-live', 'published');
      await http().put(`/api/entries/${unpublished}`).set(auth()).send({ status: 'draft' }).expect(200);
      await rename(unpublished, 'was-live-renamed');
      expect(await all()).toEqual(['/blog-post/was-live -> /blog-post/was-live-renamed 301']);
    });

    it('uses the content type previewUrl path when it has {slug}', async () => {
      const prisma = app.get(PrismaService);
      await prisma.contentType.update({ where: { id: ctId }, data: { previewUrl: 'https://site.example/articles/{slug}?token={token}' } as any });
      try {
        const id = await newEntry('preview-a', 'published');
        await rename(id, 'preview-b');
        expect(await all()).toEqual(['/articles/preview-a -> /articles/preview-b 301']);
      } finally {
        await prisma.contentType.update({ where: { id: ctId }, data: { previewUrl: null } as any });
      }
    });

    it('is off with REDIRECTS_ON_SLUG_CHANGE=false', async () => {
      (env as any).REDIRECTS_ON_SLUG_CHANGE = 'false';
      try {
        const id = await newEntry('opt-out', 'published');
        await rename(id, 'opt-out-2');
        expect(await all()).toEqual([]);
      } finally {
        (env as any).REDIRECTS_ON_SLUG_CHANGE = 'true';
      }
    });
  });
});
