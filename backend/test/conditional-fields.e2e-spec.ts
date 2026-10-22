import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Conditional fields (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ct: number;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('validates conditions in the schema', async () => {
    const res = await http().post('/api/content-types').set(auth()).send({
      name: 'media_item',
      schema: [{ name: 'kind', type: 'text' }, { name: 'url', type: 'text', condition: { field: 'missing', op: 'set' } }],
    }).expect(400);
    expect(res.body.errors[0]).toMatch(/condition.field: must name a field next to this one/);

    ct = (await http().post('/api/content-types').set(auth()).send({
      name: 'media_item',
      schema: [
        { name: 'kind', type: 'select', options: { choices: ['image', 'video'] } },
        { name: 'video_url', type: 'text', required: true, condition: { field: 'kind', op: 'eq', value: 'video' } },
        {
          name: 'credits', type: 'repeater',
          options: { subFields: [{ name: 'role', type: 'text' }, { name: 'link', type: 'text', required: true, condition: { field: 'role', op: 'in', value: ['director'] } }] },
        },
      ],
    }).expect(201)).body.id;
  });

  it('only requires a field while it is shown', async () => {
    await http().post('/api/entries').set(auth())
      .send({ contentTypeId: ct, slug: 'photo', data: { kind: 'image', credits: [{ role: 'editor' }] } }).expect(201);

    const missing = await http().post('/api/entries').set(auth())
      .send({ contentTypeId: ct, slug: 'clip', data: { kind: 'video', credits: [{ role: 'director' }] } }).expect(422);
    expect(missing.body.errors.sort()).toEqual(['credits[0].link: required', 'video_url: required']);

    // Public write API uses the same rules.
    await http().post('/api/media-item').set(auth())
      .send({ slug: 'clip', data: { kind: 'video', video_url: 'https://v.example/1', credits: [] } }).expect(201);
  });
});
