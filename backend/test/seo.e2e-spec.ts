import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('SEO — Sitemap & Robots (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);

    // Create a content type and a published entry so the sitemap has content
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'article', schema: [{ name: 'title', type: 'text', required: true }] });
    contentTypeId = ctRes.body.id;

    // Published entry — should appear in sitemap
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'sitemap-entry', status: 'published', data: { title: 'Sitemap Entry' } });

    // Draft entry — should NOT appear in sitemap
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'draft-entry', status: 'draft', data: { title: 'Draft Entry' } });
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── robots.txt ────────────────────────────────────────────────────────────────

  it('GET /api/robots.txt → returns text/plain response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/robots.txt')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('GET /api/robots.txt → contains User-agent and Allow directives', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/robots.txt')
      .expect(200);

    const text: string = res.text;
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Allow: /');
  });

  it('GET /api/robots.txt → contains Sitemap directive', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/robots.txt')
      .expect(200);

    expect(res.text).toContain('Sitemap:');
    expect(res.text).toContain('sitemap.xml');
  });

  it('GET /api/robots.txt → no auth required (public endpoint)', async () => {
    // Should work without any Authorization header
    await request(app.getHttpServer())
      .get('/api/robots.txt')
      .expect(200);
  });

  // ── sitemap.xml ───────────────────────────────────────────────────────────────

  it('GET /api/sitemap.xml → returns application/xml response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/xml/);
  });

  it('GET /api/sitemap.xml → valid XML with urlset root element', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    const xml: string = res.text;
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
  });

  it('GET /api/sitemap.xml → includes published entry slug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    expect(res.text).toContain('sitemap-entry');
  });

  it('GET /api/sitemap.xml → does NOT include draft entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    expect(res.text).not.toContain('draft-entry');
  });

  it('GET /api/sitemap.xml → includes content type list page', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    // The 'article' content type list page should be in the sitemap
    expect(res.text).toContain('article');
  });

  it('GET /api/sitemap.xml → each URL entry has <loc> and <lastmod>', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);

    const xml: string = res.text;
    expect(xml).toContain('<loc>');
    expect(xml).toContain('<lastmod>');
  });

  it('GET /api/sitemap.xml → no auth required (public endpoint)', async () => {
    await request(app.getHttpServer())
      .get('/api/sitemap.xml')
      .expect(200);
  });
});
