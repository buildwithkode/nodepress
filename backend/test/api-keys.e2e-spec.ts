import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('API Keys (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let keyId: number;
  let keyValue: string;

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

  it('POST /api/api-keys → creates an API key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Key',
        permissions: { access: 'all', contentTypes: ['*'] },
      })
      .expect(201);

    keyId    = res.body.id;
    keyValue = res.body.key;

    expect(res.body.name).toBe('Test Key');
    expect(res.body.key).toMatch(/^np_/);
    expect(res.body.permissions.access).toBe('all');
  });

  it('POST /api/api-keys → 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/api-keys')
      .send({ name: 'No Auth', permissions: { access: 'read', contentTypes: ['*'] } })
      .expect(401);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/api-keys → lists keys with id, name, permissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const found = res.body.find((k: any) => k.id === keyId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Key');
    expect(found.permissions.access).toBe('all');
  });

  it('GET /api/api-keys → 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/api-keys')
      .expect(401);
  });

  // ── Permissions enforcement ───────────────────────────────────────────────────

  it('X-API-Key with "all" access → can create entries', async () => {
    // Need a content type first
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'apitest',
        schema: [{ name: 'title', type: 'text', required: true }],
      });

    const res = await request(app.getHttpServer())
      .post('/api/apitest')
      .set('X-API-Key', keyValue)
      .send({ slug: 'via-api-key', data: { title: 'Via API Key' } })
      .expect(201);

    expect(res.body.slug).toBe('via-api-key');
  });

  it('X-API-Key with "read" access → cannot create entries (403)', async () => {
    const readKeyRes = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Read Only', permissions: { access: 'read', contentTypes: ['*'] } });

    await request(app.getHttpServer())
      .post('/api/apitest')
      .set('X-API-Key', readKeyRes.body.key)
      .send({ slug: 'blocked', data: { title: 'Blocked' } })
      .expect(403);
  });

  it('X-API-Key restricted to one content type → blocked for a different type', async () => {
    // Create a second content type
    await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'other', schema: [{ name: 'title', type: 'text', required: true }] });

    const restrictedKeyRes = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Restricted Key', permissions: { access: 'all', contentTypes: ['apitest'] } });

    // Allowed for 'apitest'
    await request(app.getHttpServer())
      .get('/api/apitest')
      .set('X-API-Key', restrictedKeyRes.body.key)
      .expect(200);

    // Blocked for 'other'
    await request(app.getHttpServer())
      .post('/api/other')
      .set('X-API-Key', restrictedKeyRes.body.key)
      .send({ slug: 'blocked', data: { title: 'Blocked' } })
      .expect(403);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/api-keys/:id → deletes the key', async () => {
    await request(app.getHttpServer())
      .delete(`/api/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Key should no longer authenticate write operations
    await request(app.getHttpServer())
      .post('/api/apitest')
      .set('X-API-Key', keyValue)
      .send({ slug: 'post-delete-check', data: { title: 'Should Fail' } })
      .expect(401);
  });

  it('DELETE /api/api-keys/:id → 401 without auth', async () => {
    await request(app.getHttpServer())
      .delete('/api/api-keys/1')
      .expect(401);
  });
});
