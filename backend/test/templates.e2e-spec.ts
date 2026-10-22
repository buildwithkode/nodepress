import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { STARTER_TEMPLATES } from '../src/templates/starter-templates';

describe('Starter templates (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it.each(STARTER_TEMPLATES.map((t) => t.id))('applies the %s template with working relations', async (id) => {
    const res = await http().post(`/api/templates/${id}/apply`).set('Authorization', `Bearer ${token}`).send({}).expect(201);
    const template = STARTER_TEMPLATES.find((t) => t.id === id)!;
    expect(res.body.entries).toBe(template.entries.length);
    expect(res.body.contentTypes.map((c: any) => c.name)).toEqual(template.contentTypes.map((c) => c.name));
    // Every reverse field resolves through the public API.
    for (const { type, field } of template.reverseFields ?? []) {
      const sample = template.entries.find((e) => e.type === type)!;
      const read = await http().get(`/api/${type}/${sample.slug}?populate=${field.name}`).expect(200);
      expect(Array.isArray(read.body.data[field.name])).toBe(true);
    }
    // Applying twice is refused instead of half-applying.
    await http().post(`/api/templates/${id}/apply`).set('Authorization', `Bearer ${token}`).send({}).expect(409);
  });

  it('blog sample posts link to their author', async () => {
    const post = await http().get('/api/post/hello-world?populate=author,categories').expect(200);
    expect(post.body.data.author.slug).toBe('alex-morgan');
    expect(post.body.data.categories.map((c: any) => c.slug)).toEqual(['news']);
    const author = await http().get('/api/author/alex-morgan?populate=posts').expect(200);
    expect(author.body.data.posts).toHaveLength(2);
    const list = (await http().get('/api/templates').set('Authorization', `Bearer ${token}`).expect(200)).body;
    expect(list.map((t: any) => t.id)).toEqual(['blog', 'agency', 'docs']);
  });
});
