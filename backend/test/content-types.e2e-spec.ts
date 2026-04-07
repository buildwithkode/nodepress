import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Content Types (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Create ────────────────────────────────────────────────────────────────────

  it('POST /api/content-types → creates a content type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'blog',
        schema: [
          { name: 'title', type: 'text', required: true },
          { name: 'body',  type: 'richtext', required: false },
        ],
      })
      .expect(201);

    contentTypeId = res.body.id;
    expect(res.body.name).toBe('blog');
    expect(res.body.schema).toHaveLength(2);
  });

  it('POST /api/content-types → normalizes name to snake_case', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Team Member', schema: [] })
      .expect(201);

    expect(res.body.name).toBe('team_member');
  });

  it('POST /api/content-types → 409 on duplicate name', async () => {
    await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'blog', schema: [] })
      .expect(409);
  });

  it('POST /api/content-types → 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/content-types')
      .send({ name: 'secret', schema: [] })
      .expect(401);
  });

  it('POST /api/content-types → 400 for reserved name', async () => {
    await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'auth', schema: [] })
      .expect(400);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/content-types → lists all content types', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.some((ct: any) => ct.name === 'blog')).toBe(true);
  });

  it('GET /api/content-types → public — no auth required', async () => {
    await request(app.getHttpServer())
      .get('/api/content-types')
      .expect(200);
  });

  // ── Update ────────────────────────────────────────────────────────────────────

  it('PUT /api/content-types/:id → updates schema', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/content-types/${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schema: [
          { name: 'title',    type: 'text',     required: true },
          { name: 'body',     type: 'richtext',  required: false },
          { name: 'featured', type: 'boolean',   required: false },
        ],
      })
      .expect(200);

    expect(res.body.schema).toHaveLength(3);
  });

  it('PUT /api/content-types/:id → 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .put('/api/content-types/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ schema: [] })
      .expect(404);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/content-types/:id → deletes content type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'to_delete', schema: [] });

    await request(app.getHttpServer())
      .delete(`/api/content-types/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/content-types')
      .set('Authorization', `Bearer ${token}`);

    expect(list.body.some((ct: any) => ct.name === 'to_delete')).toBe(false);
  });
});
