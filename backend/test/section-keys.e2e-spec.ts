import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

/**
 * Section keys: an optional `_key` on a flexible section, unique within the
 * field, so site code reads `data.sections_by_key.<key>` instead of a position.
 */
describe('Flexible section keys (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let ctId: number;
  let entryId: number;
  const http = () => request(app.getHttpServer());
  const magic = (key: string | undefined, right: string) => ({ _layout: 'real_magic', ...(key ? { _key: key } : {}), title_left: 'L', title_right: right });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
    ctId = (await http().post('/api/content-types').set(auth).send({
      name: 'landing_page', schema: [
        { name: 'title', type: 'text' },
        { name: 'sections', type: 'flexible', options: { layouts: [
          { name: 'real_magic', label: 'Real World Magic', fields: [{ name: 'title_left', type: 'text' }, { name: 'title_right', type: 'text' }] },
          { name: 'cta', label: 'CTA', fields: [{ name: 'heading', type: 'text' }] },
        ] } },
      ],
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('refuses a missing key on a repeated layout, an invalid or a repeated key (422)', async () => {
    const missing = await http().post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'missing', data: { sections: [magic('intro', 'a'), magic(undefined, 'b')] } }).expect(422);
    expect(JSON.stringify(missing.body)).toMatch(/used more than once/);
    const bad = await http().post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'bad', data: { sections: [magic('Intro Magic', 'a')] } }).expect(422);
    expect(JSON.stringify(bad.body)).toMatch(/_key/);
    const dup = await http().post('/api/entries').set(auth)
      .send({ contentTypeId: ctId, slug: 'dup', data: { sections: [magic('intro', 'a'), magic('intro', 'b')] } }).expect(422);
    expect(JSON.stringify(dup.body)).toMatch(/same key/);
  });

  it('public reads add sections_by_key — keys, and a layout used once by its name; the list keeps its order', async () => {
    entryId = (await http().post('/api/entries').set(auth).send({
      contentTypeId: ctId, slug: 'home', status: 'published',
      data: { title: 'Home', sections: [magic('intro_magic', 'first'), { _layout: 'cta', heading: 'Go' }, magic('middle_magic', 'middle'), magic('footer_magic', 'last')] },
    }).expect(201)).body.id;

    const { data } = (await http().get('/api/landing-page/home').expect(200)).body;
    expect(data.sections.map((s: any) => s._layout)).toEqual(['real_magic', 'cta', 'real_magic', 'real_magic']);
    expect(Object.keys(data.sections_by_key)).toEqual(['intro_magic', 'cta', 'middle_magic', 'footer_magic']);
    expect(data.sections_by_key.cta.heading).toBe('Go');
    expect(data.sections_by_key.footer_magic.title_right).toBe('last');
    expect(data.sections_by_key.intro_magic._id).toBe(data.sections[0]._id);

    const list = (await http().get('/api/landing-page').expect(200)).body.data;
    expect(list[0].data.sections_by_key.intro_magic.title_right).toBe('first');
  });

  it('keys follow their sections when the editor reorders them', async () => {
    const entry = (await http().get(`/api/entries/${entryId}`).set(auth).expect(200)).body;
    await http().put(`/api/entries/${entryId}`).set(auth)
      .send({ data: { ...entry.data, sections: [...entry.data.sections].reverse() } }).expect(200);
    const { data } = (await http().get('/api/landing-page/home').expect(200)).body;
    expect(data.sections[0]._key).toBe('footer_magic');
    expect(data.sections_by_key.footer_magic.title_right).toBe('last');
    expect(data.sections_by_key.intro_magic.title_right).toBe('first');
  });

  it('GraphQL exposes _key; OpenAPI documents _key and sections_by_key', async () => {
    const gql = await http().post('/graphql').set('Content-Type', 'application/json')
      .send({ query: '{ landingPage(slug: "home") { data { sections { ... on LandingPageSectionsRealMagic { _key title_right } } } } }' }).expect(200);
    expect(gql.body.errors).toBeUndefined();
    // After the reverse: footer_magic, middle_magic, the CTA (not in the fragment), intro_magic.
    expect(gql.body.data.landingPage.data.sections).toEqual([
      { _key: 'footer_magic', title_right: 'last' }, { _key: 'middle_magic', title_right: 'middle' }, {}, { _key: 'intro_magic', title_right: 'first' },
    ]);

    const doc = (await http().get('/api/openapi.json').expect(200)).body;
    const text = JSON.stringify(doc);
    expect(text).toContain('"sections_by_key"');
    expect(text).toContain('"_key"');
  });
});
