import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let editorId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    adminId = me.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Create ────────────────────────────────────────────────────────────────────

  it('POST /api/users → admin creates an editor', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'editor@test.com', password: 'Password123!', role: 'editor' })
      .expect(201);

    editorId = res.body.id;
    expect(res.body.email).toBe('editor@test.com');
    expect(res.body.role).toBe('editor');
    expect(res.body.password).toBeUndefined();
  });

  it('POST /api/users → 409 on duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'editor@test.com', password: 'Password123!', role: 'editor' })
      .expect(409);
  });

  it('POST /api/users → 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .send({ email: 'anon@test.com', password: 'Password123!', role: 'editor' })
      .expect(401);
  });

  it('POST /api/users → 403 for non-admin', async () => {
    const editorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'editor@test.com', password: 'Password123!' });
    const editorToken = editorLogin.body.access_token;

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ email: 'another@test.com', password: 'Password123!', role: 'editor' })
      .expect(403);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/users → returns all users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.every((u: any) => u.password === undefined)).toBe(true);
  });

  // ── Role change ───────────────────────────────────────────────────────────────

  it('PUT /api/users/:id/role → changes role', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/users/${editorId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'viewer' })
      .expect(200);

    expect(res.body.role).toBe('viewer');
  });

  it('PUT /api/users/:id/role → 403 when demoting last admin', async () => {
    await request(app.getHttpServer())
      .put(`/api/users/${adminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'editor' })
      .expect(403);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/users/:id → 403 when deleting self', async () => {
    await request(app.getHttpServer())
      .delete(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('DELETE /api/users/:id → deletes another user', async () => {
    await request(app.getHttpServer())
      .delete(`/api/users/${editorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(list.body.some((u: any) => u.id === editorId)).toBe(false);
  });

  // ── Change own password ───────────────────────────────────────────────────────

  it('PUT /api/users/me/password → updates password', async () => {
    await request(app.getHttpServer())
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'Password123!', newPassword: 'NewPassword456!' })
      .expect(200);

    // Old password no longer works
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Password123!' })
      .expect(401);

    // New password works
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'NewPassword456!' })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
  });

  it('PUT /api/users/me/password → 400 on wrong current password', async () => {
    await request(app.getHttpServer())
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'Something999!' })
      .expect(400);
  });
});
