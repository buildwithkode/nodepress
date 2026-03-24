import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let webhookId: number;

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

  it('POST /api/webhooks → creates a webhook', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Deploy hook',
        url: 'https://example.com/hook',
        events: ['entry.created', 'entry.updated'],
        secret: 'mysecret',
      })
      .expect(201);

    webhookId = res.body.id;
    expect(res.body.url).toBe('https://example.com/hook');
    expect(res.body.events).toContain('entry.created');
    expect(res.body.enabled).toBe(true);
  });

  it('POST /api/webhooks → 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/webhooks')
      .send({ url: 'https://example.com/hook', events: ['*'] })
      .expect(401);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/webhooks → lists webhooks with pagination meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1 });
    expect(res.body.data.some((w: any) => w.id === webhookId)).toBe(true);
  });

  // ── Toggle ────────────────────────────────────────────────────────────────────

  it('PATCH /api/webhooks/:id/toggle → disables a webhook', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/webhooks/${webhookId}/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false })
      .expect(200);

    expect(res.body.enabled).toBe(false);
  });

  it('PATCH /api/webhooks/:id/toggle → re-enables a webhook', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/webhooks/${webhookId}/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true })
      .expect(200);

    expect(res.body.enabled).toBe(true);
  });

  // ── Delivery log ──────────────────────────────────────────────────────────────

  it('GET /api/webhooks/deliveries → returns paginated delivery log', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/webhooks/deliveries')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it('GET /api/webhooks/deliveries → 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/webhooks/deliveries')
      .expect(401);
  });

  // ── Ping ─────────────────────────────────────────────────────────────────────

  it('POST /api/webhooks/:id/ping → endpoint exists and is authenticated', async () => {
    // Ping fires a real HTTP request which will fail in test (no real server).
    // Verify the endpoint exists (not 404) and is protected (not 401).
    const res = await request(app.getHttpServer())
      .post(`/api/webhooks/${webhookId}/ping`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(401);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/webhooks/:id → deletes a webhook', async () => {
    await request(app.getHttpServer())
      .delete(`/api/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/webhooks')
      .set('Authorization', `Bearer ${token}`);

    expect(list.body.data.some((w: any) => w.id === webhookId)).toBe(false);
  });

  it('DELETE /api/webhooks/:id → 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .delete('/api/webhooks/99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
