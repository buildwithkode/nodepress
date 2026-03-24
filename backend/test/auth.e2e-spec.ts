import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDatabase } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Setup status ─────────────────────────────────────────────────────────────

  it('GET /api/auth/setup-status → required: true when no users exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/setup-status')
      .expect(200);
    expect(res.body.required).toBe(true);
  });

  // ── Register ─────────────────────────────────────────────────────────────────

  it('POST /api/auth/register → creates first admin and returns token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'admin@nodepress.test', password: 'Secure123!' })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.email).toBe('admin@nodepress.test');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.password).toBeUndefined(); // never exposed
  });

  it('POST /api/auth/register → 409 when setup already done', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'second@nodepress.test', password: 'Secure123!' })
      .expect(409);
  });

  it('GET /api/auth/setup-status → required: false after registration', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/setup-status')
      .expect(200);
    expect(res.body.required).toBe(false);
  });

  // ── Login ─────────────────────────────────────────────────────────────────────

  it('POST /api/auth/login → returns token with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password: 'Secure123!' })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.email).toBe('admin@nodepress.test');
  });

  it('POST /api/auth/login → 401 with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password: 'wrongpassword' })
      .expect(401);
  });

  it('POST /api/auth/login → 401 with unknown email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@nodepress.test', password: 'Secure123!' })
      .expect(401);
  });

  // ── /me ──────────────────────────────────────────────────────────────────────

  it('GET /api/auth/me → returns user profile with valid token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password: 'Secure123!' });

    const token = loginRes.body.access_token;

    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe('admin@nodepress.test');
    expect(res.body.role).toBe('admin');
    expect(res.body.password).toBeUndefined();
  });

  it('GET /api/auth/me → 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);
  });

  it('GET /api/auth/me → 401 with malformed token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token')
      .expect(401);
  });
});
