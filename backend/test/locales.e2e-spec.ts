import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Content languages (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ctId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await app.get(PrismaService).$executeRawUnsafe(`UPDATE "settings" SET "locales" = '["en"]', "defaultLocale" = 'en'`);
    token = await registerAdmin(app);
    const ct = await request(app.getHttpServer()).post('/api/content-types').set('Authorization', `Bearer ${token}`)
      .send({ name: 'page', schema: [{ name: 'title', type: 'text' }] }).expect(201);
    ctId = ct.body.id;
    for (const [slug, locale, title] of [['about', 'en', 'About'], ['about', 'fr', 'À propos'], ['contact', 'en', 'Contact']]) {
      await request(app.getHttpServer()).post('/api/entries').set('Authorization', `Bearer ${token}`)
        .send({ contentTypeId: ctId, slug, locale, status: 'published', data: { title } }).expect(201);
    }
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('GET /api/locales is public; PUT is admin-only and validated', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get('/api/locales').expect(200)).body).toMatchObject({ defaultLocale: 'en' });

    await request(server).put('/api/locales').send({ locales: ['en', 'fr'] }).expect(401);
    const editor = await inviteUser(app, token, 'ed@test.com', 'editor');
    await request(server).put('/api/locales').set('Authorization', `Bearer ${editor.token}`).send({ locales: ['en', 'fr'] }).expect(403);
    await request(server).put('/api/locales').set('Authorization', `Bearer ${token}`).send({ locales: ['en', 'not a code'] }).expect(400);

    const saved = await request(server).put('/api/locales').set('Authorization', `Bearer ${token}`)
      .send({ locales: ['fr', 'en', 'de'], defaultLocale: 'en' }).expect(200);
    expect(saved.body).toEqual({ defaultLocale: 'en', locales: ['en', 'fr', 'de'] });
    expect((await request(server).get('/api/locales').expect(200)).body.locales).toEqual(['en', 'fr', 'de']);

    const usage = await request(server).get('/api/locales/usage').set('Authorization', `Bearer ${token}`).expect(200);
    expect(usage.body).toMatchObject({ en: 2, fr: 1 });
  });

  it('the admin entries list says which locales each entry exists in', async () => {
    const res = await request(app.getHttpServer()).get(`/api/entries?contentTypeId=${ctId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const about = res.body.data.find((e: any) => e.slug === 'about' && e.locale === 'en');
    const contact = res.body.data.find((e: any) => e.slug === 'contact');
    expect(about.translations).toEqual(['en', 'fr']);
    expect(contact.translations).toEqual(['en']);
  });

  it('public reads fall back to the default language only with ?fallback=true', async () => {
    const server = app.getHttpServer();
    const fr = await request(server).get('/api/page/about?locale=fr').expect(200);
    expect(fr.body.data.title).toBe('À propos');
    expect(fr.headers['content-language']).toBe('fr');

    await request(server).get('/api/page/contact?locale=fr').expect(404);
    const fb = await request(server).get('/api/page/contact?locale=fr&fallback=true').expect(200);
    expect(fb.body.data.title).toBe('Contact');
    expect(fb.body.locale).toBe('en');
    expect(fb.headers['content-language']).toBe('en');

    // No ?locale= → the configured default language.
    const plain = await request(server).get('/api/page/about').expect(200);
    expect(plain.body.locale).toBe('en');
  });

  it('lists fall back to the default language per entry with ?fallback=true', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const list = async (q: string) => (await request(server).get(`/api/page?${q}`).expect(200)).body;
    const served = (body: any) => body.data.map((e: any) => `${e.slug}:${e.locale}`).sort();

    expect(served(await list('locale=fr'))).toEqual(['about:fr']);
    const fb = await list('locale=fr&fallback=true');
    expect(served(fb)).toEqual(['about:fr', 'contact:en']);
    expect(fb.meta.total).toBe(2);
    // Nothing to fall back from in the default language itself.
    expect(served(await list('locale=en&fallback=true'))).toEqual(['about:en', 'contact:en']);

    // A draft translation doesn't hide the published default-language entry…
    const draft = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'contact', locale: 'fr', status: 'draft', data: { title: 'Contactez-nous' } }).expect(201);
    expect(served(await list('locale=fr&fallback=true'))).toEqual(['about:fr', 'contact:en']);
    // …until it's published (the write clears the cached list).
    await request(server).put(`/api/entries/${draft.body.id}`).set(auth).send({ status: 'published' }).expect(200);
    expect(served(await list('locale=fr&fallback=true'))).toEqual(['about:fr', 'contact:fr']);

    // A renamed entry joins its new slug's translations.
    const news = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'news-draft', locale: 'en', status: 'published', data: { title: 'Newsroom' } }).expect(201);
    await request(server).put(`/api/entries/${news.body.id}`).set(auth).send({ slug: 'news' }).expect(200);
    expect(served(await list('locale=fr&fallback=true'))).toEqual(['about:fr', 'contact:fr', 'news:en']);

    // Filters, search and cursor paging apply to the merged list.
    expect(served(await list('locale=fr&fallback=true&where[title][eq]=About'))).toEqual([]); // shadowed by À propos
    expect(served(await list('locale=fr&fallback=true&where[title][eq]=Newsroom'))).toEqual(['news:en']);
    expect(served(await list('locale=fr&fallback=true&search=newsroom'))).toEqual(['news:en']);
    const first = await list('locale=fr&fallback=true&limit=2&sort=slug:asc');
    const rest = await list(`locale=fr&fallback=true&limit=2&sort=slug:asc&cursor=${first.meta.nextCursor}`);
    expect([...served(first), ...served(rest)]).toEqual(['about:fr', 'contact:fr', 'news:en']);
  });

  it('changing the default language changes what un-localized requests get', async () => {
    const server = app.getHttpServer();
    await request(server).put('/api/locales').set('Authorization', `Bearer ${token}`).send({ locales: ['en', 'fr'], defaultLocale: 'fr' }).expect(200);
    expect((await request(server).get('/api/page/about').expect(200)).body.data.title).toBe('À propos');
    await request(server).put('/api/locales').set('Authorization', `Bearer ${token}`).send({ locales: ['en', 'fr'], defaultLocale: 'en' }).expect(200);
  });

  it('entry writes reject URL-unsafe slugs and normalize locales', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'about en About', status: 'draft', data: { title: 'x' } }).expect(400);
    await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'bad-locale', locale: 'english', status: 'draft', data: { title: 'x' } }).expect(400);

    const blank = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'blank-locale', locale: '', status: 'draft', data: { title: 'x' } }).expect(201);
    expect(blank.body.locale).toBe('en');

    const br = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'blank-locale', locale: 'pt-br', status: 'draft', data: { title: 'x' } }).expect(201);
    expect(br.body.locale).toBe('pt-BR');

    // Public write API too.
    await request(server).post('/api/page').set(auth).send({ slug: 'Not OK', data: { title: 'x' } }).expect(400);
  });
});
