import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

describe('Components (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let editorAuth: { Authorization: string };
  let componentId: number;
  let pageId: number;

  const seoFields = [
    { name: 'meta_title', type: 'text', required: true },
    { name: 'meta_description', type: 'textarea' },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
    const editor = await inviteUser(app, auth.Authorization.slice(7), 'editor@test.com', 'editor');
    editorAuth = { Authorization: `Bearer ${editor.token}` };
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('POST /api/components → creates a component with a snake_case name', async () => {
    const res = await request(server()).post('/api/components').set(auth)
      .send({ name: 'Page SEO', displayName: 'SEO', fields: seoFields })
      .expect(201);
    componentId = res.body.id;
    expect(res.body.name).toBe('page_seo');
    expect(res.body.fields).toEqual(seoFields);
  });

  it('rejects nested complex fields, duplicates and non-admins', async () => {
    const bad = await request(server()).post('/api/components').set(auth)
      .send({ name: 'nested', fields: [{ name: 'items', type: 'repeater', options: { subFields: [{ name: 'a', type: 'text' }] } }] })
      .expect(400);
    expect(bad.body.errors[0]).toMatch(/^fields\[0\]/);
    await request(server()).post('/api/components').set(auth).send({ name: 'page_seo', fields: seoFields }).expect(409);
    await request(server()).post('/api/components').set(editorAuth).send({ name: 'x', fields: seoFields }).expect(403);
    await request(server()).get('/api/components').expect(401);
    await request(server()).get('/api/components').set(editorAuth).expect(200);
  });

  it('a content type uses it as a group and a repeater; subFields are filled in by the server', async () => {
    const res = await request(server()).post('/api/content-types').set(auth).send({
      name: 'page',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'seo', type: 'group', options: { component: 'page_seo', subFields: [{ name: 'stale', type: 'text' }] } },
        { name: 'alternates', type: 'repeater', options: { component: 'page_seo' } },
      ],
    }).expect(201);
    pageId = res.body.id;
    expect(res.body.schema[1].options).toEqual({ component: 'page_seo', subFields: seoFields });
    expect(res.body.schema[2].options.subFields).toEqual(seoFields);

    const one = await request(server()).get(`/api/components/${componentId}`).set(auth).expect(200);
    expect(one.body.usage.map((u: any) => `${u.contentType}.${u.field}:${u.type}`)).toEqual([
      'page.seo:group', 'page.alternates:repeater',
    ]);
  });

  it('400 for an unknown component', async () => {
    const res = await request(server()).post('/api/content-types').set(auth).send({
      name: 'broken', schema: [{ name: 'seo', type: 'group', options: { component: 'missing' } }],
    }).expect(400);
    expect(res.body.message).toMatch(/Unknown component/);
  });

  it('entries are validated against the component fields', async () => {
    const bad = await request(server()).post('/api/entries').set(auth).send({
      contentTypeId: pageId, slug: 'bad',
      data: { title: 'Bad', seo: { meta_description: 'no title' } },
    }).expect(422);
    expect(JSON.stringify(bad.body)).toMatch(/meta_title/);

    await request(server()).post('/api/entries').set(auth).send({
      contentTypeId: pageId, slug: 'home',
      data: { title: 'Home', seo: { meta_title: 'Home' }, alternates: [{ meta_title: 'Accueil' }] },
    }).expect(201);
  });

  it('PUT /api/components/:id → rewrites the content types that use it and records a schema version', async () => {
    const fields = [...seoFields, { name: 'og_image', type: 'image' }];
    const res = await request(server()).put(`/api/components/${componentId}`).set(auth)
      .send({ fields }).expect(200);
    expect(res.body.updatedContentTypes).toEqual([{ id: pageId, name: 'page' }]);

    const ct = await request(server()).get(`/api/content-types/${pageId}`).set(auth).expect(200);
    expect(ct.body.schema[1].options.subFields).toEqual(fields);
    expect(ct.body.schema[2].options.subFields).toEqual(fields);

    const history = await request(server()).get(`/api/content-types/${pageId}/schema-history`).set(auth).expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].schema[1].options.subFields).toEqual(seoFields);
  });

  it('DELETE /api/components/:id → 409 while in use', async () => {
    const res = await request(server()).delete(`/api/components/${componentId}`).set(auth).expect(409);
    expect(res.body.message).toMatch(/page/);
  });

  it('export → import round trip carries the components', async () => {
    const exported = await request(server()).get('/api/content-types/export').set(auth).expect(200);
    expect(exported.body.components.map((c: any) => c.name)).toEqual(['page_seo']);

    // Into an empty install: components are created before the types that use them.
    await request(server()).delete(`/api/content-types/${pageId}`).set(auth).expect(200);
    await request(server()).delete(`/api/components/${componentId}`).set(auth).expect(200);

    const dry = await request(server()).post('/api/content-types/import').set(auth)
      .send({ ...exported.body, dryRun: true }).expect(201);
    expect(dry.body.valid).toBe(true);
    const withoutComponents = await request(server()).post('/api/content-types/import').set(auth)
      .send({ contentTypes: exported.body.contentTypes, dryRun: true }).expect(201);
    expect(withoutComponents.body.valid).toBe(false);

    const res = await request(server()).post('/api/content-types/import').set(auth)
      .send(exported.body).expect(201);
    expect(res.body.created).toBe(1);
    expect(res.body.components).toEqual({ created: 1, updated: 0, skipped: 0 });

    const list = await request(server()).get('/api/components').set(auth).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].fields).toHaveLength(3);
    expect(list.body[0].usage).toHaveLength(2);
  });
});
