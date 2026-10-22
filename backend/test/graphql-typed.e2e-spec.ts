import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

function gql(app: INestApplication, query: string, variables?: Record<string, any>) {
  return request(app.getHttpServer())
    .post('/graphql')
    .set('Content-Type', 'application/json; charset=utf-8')
    .send(JSON.stringify({ query, variables }));
}

describe('Typed GraphQL per content type (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const ct: Record<string, number> = {};
  const pub: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const type = async (name: string, schema: any[]) => {
    ct[name] = (await http().post('/api/content-types').set(auth()).send({ name, schema }).expect(201)).body.id;
  };
  const entry = async (key: string, type: string, slug: string, data: any, extra: Record<string, any> = {}) => {
    const res = await http().post('/api/entries').set(auth())
      .send({ contentTypeId: ct[type], slug, status: 'published', data, ...extra });
    if (res.status !== 201) throw new Error(`entry ${key}: ${res.status} ${JSON.stringify(res.body)}`);
    pub[key] = res.body.publicId;
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await app.get(PrismaService).$executeRawUnsafe(`UPDATE "settings" SET "locales" = '["en","fr"]', "defaultLocale" = 'en'`);
    token = await registerAdmin(app);

    await type('author', [{ name: 'name', type: 'text' }]);
    await type('blog_post', [
      { name: 'title', type: 'text', required: true },
      { name: 'views', type: 'number' },
      { name: 'featured', type: 'boolean' },
      { name: 'cover', type: 'image' },
      { name: 'tags', type: 'select', options: { choices: ['a', 'b'], multiple: true } },
      { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
      { name: 'seo_box', type: 'group', options: { subFields: [{ name: 'headline', type: 'text' }] } },
      { name: 'links', type: 'repeater', options: { subFields: [{ name: 'url', type: 'text' }] } },
      {
        name: 'blocks', type: 'flexible', options: {
          layouts: [
            { name: 'hero', fields: [{ name: 'heading', type: 'text' }] },
            { name: 'quote', fields: [{ name: 'text', type: 'textarea' }] },
          ],
        },
      },
    ]);
    // Reverse field, added once the forward side exists.
    await http().put(`/api/content-types/${ct.author}`).set(auth()).send({
      schema: [
        { name: 'name', type: 'text' },
        { name: 'posts', type: 'relation', options: { relatedContentType: 'blog_post', cardinality: 'many', mappedBy: 'author' } },
      ],
    }).expect(200);

    await entry('jane', 'author', 'jane', { name: 'Jane' });
    await entry('p1', 'blog_post', 'hello', {
      title: 'Hello', views: 3, featured: true, cover: '/uploads/a.png', tags: ['a'], author: pub.jane,
      seo_box: { headline: 'Hi' }, links: [{ url: 'https://x.test' }],
      blocks: [{ _layout: 'hero', heading: 'Big' }, { _layout: 'quote', text: 'Wise' }],
    });
    // A block whose layout was later removed from the schema.
    await app.get(PrismaService).$executeRawUnsafe(
      `UPDATE entries SET data = jsonb_set(data, '{blocks,2}', '{"_layout":"gone","x":1}') WHERE "publicId" = '${pub.p1}'`,
    );
    await entry('p1fr', 'blog_post', 'hello', { title: 'Bonjour', author: pub.jane }, { locale: 'fr' });
    await entry('p2', 'blog_post', 'second', { title: 'Second', author: pub.jane });
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('a content type gets typed single and list queries', async () => {
    const res = await gql(app, `{
      blogPost(slug: "hello") {
        id slug locale
        data {
          title views featured tags
          cover { url }
          author { id slug data { name } }
          seo_box { headline }
          links { url _id }
          blocks { __typename ... on BlogPostBlocksHero { heading } ... on BlogPostBlocksQuote { text } }
        }
      }
    }`).expect(200);
    expect(res.body.errors).toBeUndefined();
    const d = res.body.data.blogPost.data;
    expect(res.body.data.blogPost).toMatchObject({ id: pub.p1, slug: 'hello', locale: 'en' });
    expect(d).toMatchObject({
      title: 'Hello', views: 3, featured: true, tags: ['a'], cover: { url: '/uploads/a.png' },
      author: { id: pub.jane, slug: 'jane', data: { name: 'Jane' } },
      seo_box: { headline: 'Hi' },
    });
    expect(d.links[0].url).toBe('https://x.test');
    // Unknown layouts are dropped rather than failing the query.
    expect(d.blocks).toEqual([{ __typename: 'BlogPostBlocksHero', heading: 'Big' }, { __typename: 'BlogPostBlocksQuote', text: 'Wise' }]);
  });

  it('lists take the REST filters, paging and the language fallback', async () => {
    const q = `query($locale: String, $fallback: Boolean, $where: JSON) {
      blogPosts(locale: $locale, fallback: $fallback, where: $where, sort: "slug:asc") {
        data { slug locale data { title } }
        meta { total page limit }
      }
    }`;
    const fr = await gql(app, q, { locale: 'fr' }).expect(200);
    expect(fr.body.data.blogPosts.data.map((e: any) => e.data.title)).toEqual(['Bonjour']);
    const fb = await gql(app, q, { locale: 'fr', fallback: true }).expect(200);
    expect(fb.body.data.blogPosts.data.map((e: any) => `${e.slug}:${e.locale}`)).toEqual(['hello:fr', 'second:en']);
    expect(fb.body.data.blogPosts.meta).toMatchObject({ total: 2, page: 1, limit: 20 });

    const filtered = await gql(app, q, { locale: 'en', where: { author: { slug: { eq: 'jane' } }, title: { eq: 'Second' } } }).expect(200);
    expect(filtered.body.data.blogPosts.data.map((e: any) => e.slug)).toEqual(['second']);

    const single = await gql(app, `{ blogPost(slug: "second", locale: "fr", fallback: true) { locale } }`).expect(200);
    expect(single.body.data.blogPost.locale).toBe('en');
    expect((await gql(app, `{ blogPost(slug: "second", locale: "fr") { locale } }`)).body.data.blogPost).toBeNull();
  });

  it('reverse fields resolve, batched across a list', async () => {
    const res = await gql(app, `{ authors { data { slug data { name posts { slug } } } } }`).expect(200);
    expect(res.body.errors).toBeUndefined();
    const posts = res.body.data.authors.data[0].data.posts.map((p: any) => p.slug).sort();
    expect(posts).toEqual(['hello', 'hello', 'second']); // en + fr translations both link to Jane
  });

  it('the schema follows content type changes without a restart', async () => {
    await type('event', [{ name: 'starts_at', type: 'datetime' }]);
    await entry('e1', 'event', 'launch', { starts_at: '2026-01-01T10:00:00.000Z' });
    const res = await gql(app, `{ events { data { slug data { starts_at } } } }`).expect(200);
    expect(res.body.data.events.data).toEqual([{ slug: 'launch', data: { starts_at: '2026-01-01T10:00:00.000Z' } }]);

    await http().delete(`/api/content-types/${ct.event}`).set(auth()).expect(200);
    const gone = await gql(app, `{ events { data { slug } } }`);
    expect(gone.body.errors?.[0]?.message).toMatch(/Cannot query field "events"/);
  });

  it('drafts are never served and the code-first API still works', async () => {
    await http().post('/api/entries').set(auth())
      .send({ contentTypeId: ct.blog_post, slug: 'secret', status: 'draft', data: { title: 'Secret' } }).expect(201);
    expect((await gql(app, `{ blogPost(slug: "secret") { slug } }`)).body.data.blogPost).toBeNull();
    const list = await gql(app, `{ blogPosts(limit: 100) { data { slug } } }`);
    expect(list.body.data.blogPosts.data.map((e: any) => e.slug)).not.toContain('secret');

    const legacy = await gql(app, `{ contentTypes { name } }`).expect(200);
    expect(legacy.body.data.contentTypes.map((c: any) => c.name).sort()).toEqual(['author', 'blog_post']);
  });
});
