import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Audit Log (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);

    // Create a content type — this action is logged
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'auditblog', schema: [{ name: 'title', type: 'text', required: true }] });
    contentTypeId = ctRes.body.id;

    // Create and update an entry — each action is logged
    const entryRes = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'audit-entry', status: 'published', data: { title: 'Audit Entry' } });

    await request(app.getHttpServer())
      .put(`/api/entries/${entryRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { title: 'Audit Entry Updated' } });
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────────

  it('GET /api/audit-log → 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/audit-log')
      .expect(401);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/audit-log → returns paginated audit events', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/audit-log → each event has required fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const event = res.body.data[0];
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('action');
    expect(event).toHaveProperty('resource');
    expect(event).toHaveProperty('resourceId');
    expect(event).toHaveProperty('createdAt');
  });

  it('GET /api/audit-log → logs entry create action', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .query({ resource: 'entry' })
      .expect(200);

    const actions = res.body.data.map((e: any) => e.action);
    expect(actions).toContain('created');
    expect(actions).toContain('updated');
  });

  it('GET /api/audit-log → logs entry update action', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .query({ resource: 'entry' })
      .expect(200);

    const updateEvent = res.body.data.find((e: any) => e.action === 'updated');
    expect(updateEvent).toBeDefined();
    expect(updateEvent.resourceId).toBe('audit-entry');
  });

  // ── Filtering ─────────────────────────────────────────────────────────────────

  it('GET /api/audit-log?resource=entry → filters by resource type', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .query({ resource: 'entry' })
      .expect(200);

    expect(res.body.data.every((e: any) => e.resource === 'entry')).toBe(true);
  });

  // ── Pagination ────────────────────────────────────────────────────────────────

  it('GET /api/audit-log → pagination works', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 1 })
      .expect(200);

    expect(res.body.data.length).toBe(1);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(1);
  });

  // ── Delete and restore also get logged ───────────────────────────────────────

  it('DELETE and restore → logged as deleted and restored', async () => {
    // Create a fresh entry to delete
    const entry = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug: 'to-delete-log', status: 'published', data: { title: 'To Delete' } });

    await request(app.getHttpServer())
      .delete(`/api/entries/${entry.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    await request(app.getHttpServer())
      .post(`/api/entries/${entry.body.id}/restore`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app.getHttpServer())
      .get('/api/audit-log')
      .set('Authorization', `Bearer ${token}`)
      .query({ resource: 'entry' })
      .expect(200);

    const actions = res.body.data.map((e: any) => e.action);
    expect(actions).toContain('deleted');
    expect(actions).toContain('restored');
  });
});
