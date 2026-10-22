import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Field data migrations (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ct: number;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const schema = [
    { name: 'headline', type: 'text' },
    { name: 'price', type: 'text' },
    { name: 'body', type: 'richtext' },
    { name: 'featured', type: 'text' },
    { name: 'legacy', type: 'text' },
  ];
  // Field values only — bundled plugins add their own `_`-prefixed keys.
  const dataOf = async (slug: string) => {
    const row = (await http().get(`/api/entries?contentTypeId=${ct}&limit=50`).set(auth()).expect(200))
      .body.data.find((e: any) => e.slug === slug);
    return Object.fromEntries(Object.entries(row.data).filter(([k]) => !k.startsWith('_')));
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    ct = (await http().post('/api/content-types').set(auth()).send({ name: 'product', schema }).expect(201)).body.id;
    const rows = [
      { slug: 'a', data: { headline: 'Alpha', price: ' 12.50 ', body: '<p>Hello <b>world</b></p>', featured: 'yes', legacy: 'old' } },
      { slug: 'b', data: { headline: 'Beta', price: 'call us', body: '<p>Two</p>', featured: '0' } },
      { slug: 'c', data: { headline: 'Gamma' } },
    ];
    for (const r of rows) {
      await http().post('/api/entries').set(auth()).send({ contentTypeId: ct, status: 'published', ...r }).expect(201);
    }
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  const next = [
    { name: 'title', type: 'text' },
    { name: 'price', type: 'number' },
    { name: 'summary', type: 'textarea' },
    { name: 'featured', type: 'boolean' },
  ];
  const fieldMigrations = {
    renames: [{ from: 'headline', to: 'title' }, { from: 'body', to: 'summary' }],
    convert: ['price', 'summary', 'featured'],
    drop: ['legacy'],
  };

  it('rejects migrations that do not match the schema change', async () => {
    const res = await http().post(`/api/content-types/${ct}/schema-impact`).set(auth())
      .send({ schema: next, fieldMigrations: { renames: [{ from: 'nope', to: 'title' }], convert: ['title'] } })
      .expect(400);
    expect(res.body.errors.join(' ')).toMatch(/"nope" is not a field/);
  });

  it('previews the impact without changing anything', async () => {
    const res = await http().post(`/api/content-types/${ct}/schema-impact`).set(auth())
      .send({ schema: next, fieldMigrations }).expect(200);
    const step = (kind: string, field: string) => res.body.steps.find((s: any) => s.kind === kind && s.field === field);
    expect(res.body.entryCount).toBe(3);
    expect(step('rename', 'title')).toMatchObject({ from: 'headline', entries: 3 });
    expect(step('convert', 'price')).toMatchObject({ fromType: 'text', toType: 'number', entries: 2, lost: 1 });
    expect(step('convert', 'featured')).toMatchObject({ entries: 2, lost: 0 });
    expect(step('drop', 'legacy')).toMatchObject({ entries: 1 });
    expect(res.body.retyped.map((r: any) => r.field).sort()).toEqual(['featured', 'price', 'summary']);
    expect((await dataOf('a')).headline).toBe('Alpha');
  });

  it('migrates entry data with the schema', async () => {
    const res = await http().put(`/api/content-types/${ct}`).set(auth())
      .send({ schema: next, fieldMigrations }).expect(200);
    expect(res.body.migrated).toHaveLength(6);

    expect(await dataOf('a')).toEqual({ title: 'Alpha', price: 12.5, summary: 'Hello world', featured: true });
    expect(await dataOf('b')).toEqual({ title: 'Beta', summary: 'Two', featured: false });
    expect(await dataOf('c')).toEqual({ title: 'Gamma' });

    // The public API serves the new shape straight away (cache refreshed).
    const pub = await http().get('/api/product/a').expect(200);
    expect(pub.body.data.title).toBe('Alpha');
    expect(pub.body.data.headline).toBeUndefined();

    // Migrated entries pass validation on their next save.
    const list = (await http().get(`/api/entries?contentTypeId=${ct}`).set(auth())).body.data;
    const a = list.find((e: any) => e.slug === 'a');
    await http().put(`/api/entries/${a.id}`).set(auth()).send({ data: a.data }).expect(200);
  });

  it('warns about retyped fields that were not converted', async () => {
    const res = await http().put(`/api/content-types/${ct}`).set(auth())
      .send({ schema: next.map((f) => (f.name === 'title' ? { ...f, type: 'number' } : f)) }).expect(200);
    expect(res.body.warnings.join(' ')).toMatch(/"title" changed from text to number/);
  });

  it('refuses conversions that make no sense', async () => {
    const res = await http().put(`/api/content-types/${ct}`).set(auth())
      .send({ schema: next.map((f) => (f.name === 'price' ? { ...f, type: 'image' } : f)), fieldMigrations: { convert: ['price'] } })
      .expect(400);
    expect(res.body.errors[0]).toMatch(/can't be converted from number to image/);
  });

  it('follows a renamed relation field in reverse fields of other types', async () => {
    const person = (await http().post('/api/content-types').set(auth())
      .send({ name: 'person', schema: [{ name: 'name', type: 'text' }] }).expect(201)).body.id;
    const post = (await http().post('/api/content-types').set(auth()).send({
      name: 'article',
      schema: [{ name: 'writer', type: 'relation', options: { relatedContentType: 'person', cardinality: 'one' } }],
    }).expect(201)).body.id;
    await http().put(`/api/content-types/${person}`).set(auth()).send({
      schema: [{ name: 'name', type: 'text' }, { name: 'articles', type: 'relation', options: { relatedContentType: 'article', cardinality: 'many', mappedBy: 'writer' } }],
    }).expect(200);

    await http().put(`/api/content-types/${post}`).set(auth()).send({
      schema: [{ name: 'author', type: 'relation', options: { relatedContentType: 'person', cardinality: 'one' } }],
      fieldMigrations: { renames: [{ from: 'writer', to: 'author' }] },
    }).expect(200);

    const updated = (await http().get(`/api/content-types/${person}`).set(auth()).expect(200)).body;
    expect(updated.schema[1].options.mappedBy).toBe('author');
  });

  it('migrates fields inside groups, repeater rows and flexible blocks', async () => {
    const nestedSchema = [
      { name: 'name', type: 'text' },
      { name: 'seo', type: 'group', options: { subFields: [{ name: 'headline', type: 'text' }, { name: 'legacy', type: 'text' }] } },
      { name: 'links', type: 'repeater', options: { subFields: [{ name: 'href', type: 'text' }, { name: 'weight', type: 'text' }] } },
      {
        name: 'blocks', type: 'flexible',
        options: { layouts: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }] }, { name: 'quote', fields: [{ name: 'heading', type: 'text' }] }] },
      },
    ];
    const page = (await http().post('/api/content-types').set(auth()).send({ name: 'landing', schema: nestedSchema }).expect(201)).body.id;
    await http().post('/api/entries').set(auth()).send({
      contentTypeId: page, slug: 'home', status: 'published',
      data: {
        name: 'Home',
        seo: { headline: 'Welcome', legacy: 'x' },
        links: [{ href: '/a', weight: '2' }, { href: '/b', weight: 'heavy' }],
        blocks: [{ _layout: 'hero', heading: 'Big' }, { _layout: 'quote', heading: 'Keep me' }],
      },
    }).expect(201);

    const next = [
      { name: 'name', type: 'text' },
      { name: 'meta', type: 'group', options: { subFields: [{ name: 'title', type: 'text' }] } },
      { name: 'links', type: 'repeater', options: { subFields: [{ name: 'url', type: 'text' }, { name: 'weight', type: 'number' }] } },
      {
        name: 'blocks', type: 'flexible',
        options: { layouts: [{ name: 'hero', fields: [{ name: 'title', type: 'text' }] }, { name: 'quote', fields: [{ name: 'heading', type: 'text' }] }] },
      },
    ];
    const fieldMigrations = {
      renames: [{ from: 'seo', to: 'meta' }, { from: 'meta.headline', to: 'meta.title' }, { from: 'links.href', to: 'links.url' }, { from: 'blocks.hero.heading', to: 'blocks.hero.title' }],
      convert: ['links.weight'],
      drop: ['meta.legacy'],
    };

    const impact = await http().post(`/api/content-types/${page}/schema-impact`).set(auth())
      .send({ schema: next, fieldMigrations: { renames: fieldMigrations.renames } }).expect(200);
    expect(impact.body.retyped).toEqual([expect.objectContaining({ field: 'links.weight', convertible: true })]);
    expect(impact.body.removedNested).toEqual(['meta.legacy']);
    const full = await http().post(`/api/content-types/${page}/schema-impact`).set(auth())
      .send({ schema: next, fieldMigrations }).expect(200);
    expect(full.body.steps.find((s: any) => s.field === 'links.weight')).toMatchObject({ entries: 1, lost: 1 });

    await http().put(`/api/content-types/${page}`).set(auth()).send({ schema: next, fieldMigrations }).expect(200);
    const row = (await http().get(`/api/entries?contentTypeId=${page}`).set(auth())).body.data[0].data;
    expect(row.meta).toEqual({ title: 'Welcome' });
    expect(row.seo).toBeUndefined();
    expect(row.links).toEqual([expect.objectContaining({ url: '/a', weight: 2 }), expect.objectContaining({ url: '/b' })]);
    expect(row.links[1].weight).toBeUndefined();
    expect(row.links[0].href).toBeUndefined();
    expect(row.blocks).toEqual([
      expect.objectContaining({ _layout: 'hero', title: 'Big' }),
      expect.objectContaining({ _layout: 'quote', heading: 'Keep me' }),
    ]);
    expect(row.blocks[0].heading).toBeUndefined();
  });
});
