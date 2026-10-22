import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

describe('Choice lists (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let editorAuth: { Authorization: string };
  let listId: number;
  const ids: Record<string, number> = {};
  const entryIds: Record<string, number> = {};

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

  it('POST /api/choice-lists → creates a list (admin only), validates choices', async () => {
    const res = await request(server()).post('/api/choice-lists').set(auth).send({
      name: 'Gender', label: 'Gender',
      choices: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other' }],
    }).expect(201);
    listId = res.body.id;
    expect(res.body.name).toBe('gender');

    await request(server()).post('/api/choice-lists').set(auth).send({ name: 'gender', label: 'G', choices: ['a'] }).expect(409);
    const bad = await request(server()).post('/api/choice-lists').set(auth)
      .send({ name: 'dupes', label: 'D', choices: ['a', 'a'] }).expect(400);
    expect(bad.body.errors).toEqual(['choices[1].value "a": duplicate value']);
    await request(server()).post('/api/choice-lists').set(auth).send({ name: 'empty', label: 'E', choices: [] }).expect(400);
    await request(server()).post('/api/choice-lists').set(editorAuth).send({ name: 'x', label: 'X', choices: ['a'] }).expect(403);
    await request(server()).get('/api/choice-lists').set(editorAuth).expect(403);
    await request(server()).get('/api/choice-lists').expect(401);
  });

  it('"choice-lists" is a reserved content type name', async () => {
    await request(server()).post('/api/content-types').set(auth).send({ name: 'choice-lists', schema: [] }).expect(400);
  });

  it('content types use the list at the top level and in a repeater; the server copies it in', async () => {
    const person = await request(server()).post('/api/content-types').set(auth).send({
      name: 'person',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'gender', type: 'select', options: { choiceList: 'gender' } },
      ],
    }).expect(201);
    ids.person = person.body.id;
    expect(person.body.schema[1].options).toEqual({
      choiceList: 'gender', choices: ['female', 'male', 'other'], choiceLabels: { female: 'Female', male: 'Male' },
    });

    const family = await request(server()).post('/api/content-types').set(auth).send({
      name: 'family',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'kids', type: 'repeater', options: { subFields: [
          { name: 'name', type: 'text' },
          { name: 'gender', type: 'select', options: { choiceList: 'gender', choices: ['stale'] } },
        ] } },
      ],
    }).expect(201);
    ids.family = family.body.id;
    expect(family.body.schema[1].options.subFields[1].options.choices).toEqual(['female', 'male', 'other']);

    const unknown = await request(server()).post('/api/content-types').set(auth).send({
      name: 'nope', schema: [{ name: 'g', type: 'select', options: { choiceList: 'missing' } }],
    }).expect(400);
    expect(unknown.body.message).toBe('Unknown choice list: "missing"');

    const list = await request(server()).get('/api/choice-lists').set(auth).expect(200);
    expect(list.body[0].usage.contentTypes.map((u: any) => `${u.contentType}.${u.field}`)).toEqual(['family.kids.gender', 'person.gender']);
  });

  it('entries are validated against the list', async () => {
    await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.person, slug: 'bad', data: { title: 'Bad', gender: 'robot' } }).expect(422);
    const sam = await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.person, slug: 'sam', data: { title: 'Sam', gender: 'other' } }).expect(201);
    entryIds.sam = sam.body.id;
    await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.person, slug: 'ann', data: { title: 'Ann', gender: 'female' } }).expect(201);
    await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.family, slug: 'bad', data: { kids: [{ name: 'A', gender: 'robot' }] } }).expect(422);
    const smiths = await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.family, slug: 'smiths', data: { kids: [{ name: 'A', gender: 'male' }, { name: 'B', gender: 'other' }] } })
      .expect(201);
    entryIds.smiths = smiths.body.id;
  });

  it('public GET without auth — one list, or several by ?names=', async () => {
    const one = await request(server()).get('/api/choice-lists/gender').expect(200);
    expect(one.headers['cache-control']).toBe('public, max-age=60');
    expect(one.body).toEqual({
      name: 'gender', label: 'Gender',
      choices: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other' }],
    });
    const many = await request(server()).get('/api/choice-lists?names=gender,nope').expect(200);
    expect(many.body.map((l: any) => l.name)).toEqual(['gender']);
    await request(server()).get('/api/choice-lists/nope').expect(404);
  });

  it('renaming a label and adding a value updates both content types (and the public read)', async () => {
    const res = await request(server()).put(`/api/choice-lists/${listId}`).set(auth).send({
      choices: [{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Male' }, { value: 'other' }, { value: 'nonbinary', label: 'Non-binary' }],
    }).expect(200);
    expect(res.body.updatedContentTypes.map((c: any) => c.name).sort()).toEqual(['family', 'person']);
    expect(res.body.removedValuesInUse).toBeUndefined();

    const person = await request(server()).get(`/api/content-types/${ids.person}`).set(auth).expect(200);
    expect(person.body.schema[1].options.choices).toEqual(['female', 'male', 'other', 'nonbinary']);
    expect(person.body.schema[1].options.choiceLabels).toEqual({ female: 'Woman', male: 'Male', nonbinary: 'Non-binary' });
    const family = await request(server()).get(`/api/content-types/${ids.family}`).set(auth).expect(200);
    expect(family.body.schema[1].options.subFields[1].options.choices).toEqual(['female', 'male', 'other', 'nonbinary']);

    const history = await request(server()).get(`/api/content-types/${ids.person}/schema-history`).set(auth).expect(200);
    expect(history.body.length).toBeGreaterThan(0);

    const pub = await request(server()).get('/api/choice-lists/gender').expect(200);
    expect(pub.body.choices[0]).toEqual({ value: 'female', label: 'Woman' });

    await request(server()).post('/api/entries').set(auth)
      .send({ contentTypeId: ids.person, slug: 'kim', data: { title: 'Kim', gender: 'nonbinary' } }).expect(201);
  });

  it('removing a value in use reports removedValuesInUse; entries holding it fail on next save', async () => {
    const res = await request(server()).put(`/api/choice-lists/${listId}`).set(auth).send({
      choices: [{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Male' }, { value: 'nonbinary', label: 'Non-binary' }],
    }).expect(200);
    expect(res.body.removedValues).toEqual(['other']);
    expect(res.body.removedValuesInUse).toEqual(expect.arrayContaining([
      { contentTypeId: ids.person, contentType: 'person', field: 'gender', entries: 1 },
      { contentTypeId: ids.family, contentType: 'family', field: 'kids.gender', entries: 1 },
    ]));
    expect(res.body.removedValuesInUse).toHaveLength(2);

    await request(server()).put(`/api/entries/${entryIds.sam}`).set(auth)
      .send({ data: { title: 'Sam again', gender: 'other' } }).expect(422);
    await request(server()).put(`/api/entries/${entryIds.smiths}`).set(auth)
      .send({ data: { kids: [{ name: 'B', gender: 'other' }] } }).expect(422);
  });

  it('components hold lists too: written expanded, updated by propagation', async () => {
    const comp = await request(server()).post('/api/components').set(auth).send({
      name: 'profile', fields: [{ name: 'gender', type: 'select', options: { choiceList: 'gender' } }],
    }).expect(201);
    expect(comp.body.fields[0].options.choices).toEqual(['female', 'male', 'nonbinary']);
    const bad = await request(server()).post('/api/components').set(auth).send({
      name: 'broken', fields: [{ name: 'g', type: 'select', options: { choiceList: 'missing' } }],
    });
    expect(bad.status).toBe(400);

    await request(server()).put(`/api/choice-lists/${listId}`).set(auth).send({
      choices: [{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Man' }, { value: 'nonbinary', label: 'Non-binary' }],
    }).expect(200).expect((r) => expect(r.body.updatedComponents).toEqual([{ id: comp.body.id, name: 'profile' }]));
    const after = await request(server()).get(`/api/components/${comp.body.id}`).set(auth).expect(200);
    expect(after.body.fields[0].options.choiceLabels.male).toBe('Man');
  });

  it('DELETE while in use → 409 naming where', async () => {
    const res = await request(server()).delete(`/api/choice-lists/${listId}`).set(auth).expect(409);
    expect(res.body.message).toMatch(/family, person, component profile/);
  });

  it('export → import round trip carries the lists', async () => {
    const exported = await request(server()).get('/api/content-types/export').set(auth).expect(200);
    expect(exported.body.choiceLists.map((l: any) => l.name)).toEqual(['gender']);

    // A fresh list in the bundle only: the dry run expands against it without writing.
    const bundle = {
      contentTypes: [{ name: 'shirt', schema: [{ name: 'size', type: 'select', options: { choiceList: 'size' } }] }],
      choiceLists: [{ name: 'size', label: 'Size', choices: ['s', 'm', 'l'] }],
    };
    const dry = await request(server()).post('/api/content-types/import').set(auth).send({ ...bundle, dryRun: true }).expect(201);
    expect(dry.body.valid).toBe(true);
    await request(server()).get('/api/choice-lists/size').expect(404);
    const without = await request(server()).post('/api/content-types/import').set(auth)
      .send({ contentTypes: bundle.contentTypes, dryRun: true }).expect(201);
    expect(without.body.valid).toBe(false);

    const res = await request(server()).post('/api/content-types/import').set(auth).send(bundle).expect(201);
    expect(res.body.choiceLists).toEqual({ created: 1, updated: 0, skipped: 0 });
    const shirt = (await request(server()).get('/api/content-types').set(auth)).body.find((c: any) => c.name === 'shirt');
    expect(shirt.schema[0].options.choices).toEqual(['s', 'm', 'l']);

    // The full export imports back cleanly (lists updated in place).
    const again = await request(server()).post('/api/content-types/import').set(auth).send(exported.body).expect(201);
    expect(again.body.choiceLists.updated).toBe(1);
  });

  it('audit log records list writes', async () => {
    const res = await request(server()).get('/api/audit-log?resource=choice_list').set(auth).expect(200);
    const rows = Array.isArray(res.body) ? res.body : res.body.data;
    expect(rows.map((r: any) => r.action)).toEqual(expect.arrayContaining(['created', 'updated']));
  });
});
