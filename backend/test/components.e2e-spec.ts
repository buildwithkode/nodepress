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

  it('PUT /api/components/:id with fieldMigrations → renames move entry data in every field using it', async () => {
    const renamed = [{ name: 'title', type: 'text', required: true }, ...seoFields.slice(1), { name: 'og_image', type: 'image' }];
    await request(server()).put(`/api/components/${componentId}`).set(auth)
      .send({ fields: renamed, fieldMigrations: { renames: [{ from: 'meta_title', to: 'title' }] } }).expect(200);
    const entries = await request(server()).get(`/api/entries?contentTypeId=${pageId}`).set(auth).expect(200);
    const home = entries.body.data.find((e: any) => e.slug === 'home').data;
    expect(home.seo).toMatchObject({ title: 'Home' });
    expect(home.seo.meta_title).toBeUndefined();
    expect(home.alternates[0]).toMatchObject({ title: 'Accueil' });

    // and back, so the rest of the suite sees the original component
    await request(server()).put(`/api/components/${componentId}`).set(auth)
      .send({ fields: [...seoFields, { name: 'og_image', type: 'image' }], fieldMigrations: { renames: [{ from: 'title', to: 'meta_title' }] } })
      .expect(200);
    const again = await request(server()).get(`/api/entries?contentTypeId=${pageId}`).set(auth).expect(200);
    expect(again.body.data.find((e: any) => e.slug === 'home').data.seo).toMatchObject({ meta_title: 'Home' });
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

describe('Components used inline and as flexible layouts (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let componentId: number;
  const ids: Record<string, number> = {};

  const genderFields = [
    { name: 'gender', type: 'select', options: { choices: ['male', 'female', 'other'] } },
    { name: 'pronouns', type: 'text', condition: { field: 'gender', op: 'eq', value: 'other' } },
  ];
  const tagged = (fields: any[]) => fields.map((f) => ({ ...f, component: 'gender' }));

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    auth = { Authorization: `Bearer ${await registerAdmin(app)}` };
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  const server = () => app.getHttpServer();
  const entriesOf = async (type: string) =>
    (await request(server()).get(`/api/entries?contentTypeId=${ids[type]}`).set(auth).expect(200)).body.data;

  it('two content types include the component inline; one also as a flexible layout', async () => {
    componentId = (await request(server()).post('/api/components').set(auth)
      .send({ name: 'gender', displayName: 'Gender', fields: genderFields }).expect(201)).body.id;

    const person = await request(server()).post('/api/content-types').set(auth).send({
      name: 'person',
      schema: [{ name: 'title', type: 'text', required: true }, { name: 'gender', type: 'text', component: 'gender' }],
    }).expect(201);
    ids.person = person.body.id;
    expect(person.body.schema).toEqual([{ name: 'title', type: 'text', required: true }, ...tagged(genderFields)]);

    const pet = await request(server()).post('/api/content-types').set(auth).send({
      name: 'pet',
      schema: [
        { name: 'name', type: 'text' },
        ...tagged(genderFields),
        { name: 'blocks', type: 'flexible', options: { layouts: [
          { name: 'note', fields: [{ name: 'text', type: 'text' }] },
          { component: 'gender', fields: [] },
        ] } },
      ],
    }).expect(201);
    ids.pet = pet.body.id;
    expect(pet.body.schema.map((f: any) => f.name)).toEqual(['name', 'gender', 'pronouns', 'blocks']);
    expect(pet.body.schema[3].options.layouts[1]).toEqual({ name: 'gender', label: 'Gender', component: 'gender', fields: genderFields });

    const one = await request(server()).get(`/api/components/${componentId}`).set(auth).expect(200);
    expect(one.body.usage.map((u: any) => `${u.contentType}.${u.field}${u.layout ? `.${u.layout}` : ''}:${u.type}`)).toEqual([
      'person.gender:inline', 'pet.gender:inline', 'pet.blocks.gender:layout',
    ]);
    expect(one.body.usage[0].fields).toEqual(['gender', 'pronouns']);
  });

  it('400 for a component used inline twice, or a field name it clashes with', async () => {
    const twice = await request(server()).post('/api/content-types').set(auth).send({
      name: 'twice',
      schema: [{ name: 'gender', type: 'text', component: 'gender' }, { name: 'x', type: 'text' }, { name: 'pronouns', type: 'text', component: 'gender' }],
    }).expect(400);
    expect(twice.body.message).toMatch(/used inline more than once/);

    const clash = await request(server()).post('/api/content-types').set(auth).send({
      name: 'clash',
      schema: [{ name: 'Pronouns', type: 'text' }, { name: 'gender', type: 'text', component: 'gender' }],
    }).expect(400);
    expect(clash.body.errors[0]).toMatch(/"pronouns": duplicate field name.*component "gender"/);

    const nested = await request(server()).post('/api/content-types').set(auth).send({
      name: 'nested',
      schema: [{ name: 'g', type: 'group', options: { subFields: [{ name: 'a', type: 'text', component: 'gender' }] } }],
    }).expect(400);
    expect(nested.body.errors[0]).toMatch(/only top-level fields/);
  });

  it('entries store flat values, validated against the component fields', async () => {
    const bad = await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.person, slug: 'bad', data: { title: 'Bad', gender: 'robot' } });
    expect(bad.status).toBe(422);

    await request(server()).post('/api/entries').set(auth).send({
      contentTypeId: ids.person, slug: 'sam', status: 'published', data: { title: 'Sam', gender: 'other', pronouns: 'xe' },
    }).expect(201);
    await request(server()).post('/api/entries').set(auth).send({
      contentTypeId: ids.pet, slug: 'rex', status: 'published',
      data: { name: 'Rex', gender: 'male', blocks: [{ _layout: 'gender', gender: 'other', pronouns: 'they' }] },
    }).expect(201);

    const pub = await request(server()).get('/api/person/sam').expect(200);
    const data = pub.body.data ?? pub.body;
    expect(JSON.stringify(data)).toContain('"gender":"other"');
    expect((await entriesOf('person'))[0].data).toMatchObject({ title: 'Sam', gender: 'other', pronouns: 'xe' });
  });

  it('typed GraphQL and /api/openapi.json see inline fields as plain top-level fields', async () => {
    const gql = await request(server()).post('/graphql').set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: '{ __type(name: "PersonData") { fields { name } } }' })).expect(200);
    const names = gql.body.data.__type.fields.map((f: any) => f.name);
    expect(names).toEqual(expect.arrayContaining(['title', 'gender', 'pronouns']));

    const doc = (await request(server()).get('/api/openapi.json').expect(200)).body;
    expect(Object.keys(doc.components.schemas.PersonData.properties)).toEqual(expect.arrayContaining(['title', 'gender', 'pronouns']));
  });

  it('renaming a component field with fieldMigrations moves data in inline and layout uses', async () => {
    const renamed = [genderFields[0], { ...genderFields[1], name: 'they' }];
    const res = await request(server()).put(`/api/components/${componentId}`).set(auth)
      .send({ fields: renamed, fieldMigrations: { renames: [{ from: 'pronouns', to: 'they' }] } }).expect(200);
    expect(res.body.propagationErrors).toBeUndefined();
    expect(res.body.updatedContentTypes.map((c: any) => c.name)).toEqual(['person', 'pet']);

    const sam = (await entriesOf('person'))[0].data;
    expect(sam).toMatchObject({ title: 'Sam', gender: 'other', they: 'xe' });
    expect(sam.pronouns).toBeUndefined();
    const rex = (await entriesOf('pet'))[0].data;
    expect(rex.blocks[0]).toMatchObject({ _layout: 'gender', gender: 'other', they: 'they' });
    expect(rex.blocks[0].pronouns).toBeUndefined();

    const pet = await request(server()).get(`/api/content-types/${ids.pet}`).set(auth).expect(200);
    expect(pet.body.schema.map((f: any) => f.name)).toEqual(['name', 'gender', 'they', 'blocks']);
    expect(pet.body.schema[3].options.layouts[1].fields).toEqual(renamed);
  });

  it('removing a component field removes it from inline uses and keeps the data', async () => {
    await request(server()).put(`/api/components/${componentId}`).set(auth).send({ fields: [genderFields[0]] }).expect(200);
    const person = await request(server()).get(`/api/content-types/${ids.person}`).set(auth).expect(200);
    expect(person.body.schema.map((f: any) => f.name)).toEqual(['title', 'gender']);
    expect((await entriesOf('person'))[0].data.they).toBe('xe');
    // back to two fields for the rest of the suite
    await request(server()).put(`/api/components/${componentId}`).set(auth)
      .send({ fields: [genderFields[0], { ...genderFields[1], name: 'they' }] }).expect(200);
  });

  it('DELETE /api/components/:id → 409 while used inline', async () => {
    const res = await request(server()).delete(`/api/components/${componentId}`).set(auth).expect(409);
    expect(res.body.message).toMatch(/person, pet/);
  });

  it('export → import round trip keeps inline and layout uses', async () => {
    const exported = (await request(server()).get('/api/content-types/export').set(auth).expect(200)).body;
    expect(exported.components.map((c: any) => c.name)).toEqual(['gender']);
    const before = Object.fromEntries(exported.contentTypes.map((ct: any) => [ct.name, ct.schema]));

    await request(server()).delete(`/api/content-types/${ids.person}`).set(auth).expect(200);
    await request(server()).delete(`/api/content-types/${ids.pet}`).set(auth).expect(200);
    await request(server()).delete(`/api/components/${componentId}`).set(auth).expect(200);

    const res = await request(server()).post('/api/content-types/import').set(auth).send(exported).expect(201);
    expect(res.body.created).toBe(2);
    expect(res.body.components).toEqual({ created: 1, updated: 0, skipped: 0 });

    const types = (await request(server()).get('/api/content-types').set(auth).expect(200)).body;
    for (const ct of types) expect(ct.schema).toEqual(before[ct.name]);
    const list = (await request(server()).get('/api/components').set(auth).expect(200)).body;
    expect(list[0].usage.map((u: any) => u.type)).toEqual(['inline', 'inline', 'layout']);
  });
});
