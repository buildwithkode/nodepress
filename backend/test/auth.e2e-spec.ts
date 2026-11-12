import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashToken } from '../src/auth/token-hash';

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

  // ── Password reset ────────────────────────────────────────────────────────────

  it('POST /api/auth/forgot-password → returns generic message for unknown email (no leaking)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@nodepress.test' })
      .expect(201);

    expect(res.body.message).toBeDefined();
  });

  it('POST /api/auth/forgot-password → returns same generic message for known email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@nodepress.test' })
      .expect(201);

    expect(res.body.message).toBeDefined();
  });

  it('POST /api/auth/reset-password → updates password with valid token', async () => {
    // Outside production the link comes back in the response (SMTP is a no-op in tests)
    const forgot = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@nodepress.test' });
    const token = new URL(forgot.body.devResetUrl).searchParams.get('token')!;

    // The database holds only the token's hash
    const prisma = app.get(PrismaService);
    const record = await prisma.passwordResetToken.findFirst({
      where: { used: false },
      orderBy: { createdAt: 'desc' },
    });
    expect(record!.token).toBe(hashToken(token));
    expect(record!.token).not.toContain(token);

    const res = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewSecure456!' })
      .expect(201);

    expect(res.body.message).toBeDefined();

    // Old password no longer works
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password: 'Secure123!' })
      .expect(401);

    // New password works
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password: 'NewSecure456!' })
      .expect(201);
    expect(loginRes.body.access_token).toBeDefined();
  });

  it('POST /api/auth/reset-password → 400 when token is already used', async () => {
    const forgot = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@nodepress.test' });
    const token = new URL(forgot.body.devResetUrl).searchParams.get('token')!;

    // Use it once
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'AnotherPass789!' })
      .expect(201);

    // Use it again — must be rejected
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token, password: 'AnotherPass789!' })
      .expect(400);
  });

  it('POST /api/auth/reset-password → 400 for invalid token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'SomePass123!' })
      .expect(400);
  });

  // ── Ending sessions early ────────────────────────────────────────────────────

  const signIn = async (password: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@nodepress.test', password })
      .expect(201);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    return { token: res.body.access_token as string, cookies };
  };
  const me = (token: string) => request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

  it('stores refresh tokens only as hashes', async () => {
    const { cookies } = await signIn('AnotherPass789!');
    const raw = cookies.split('np_refresh=')[1].split(';')[0];
    const rows = await app.get(PrismaService).refreshToken.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.token.startsWith('sha256:'))).toBe(true);
    expect(rows.some((r) => r.token === hashToken(raw))).toBe(true);
  });

  it('a password change cancels every other login at once; this browser refreshes back in', async () => {
    const here = await signIn('AnotherPass789!');
    const elsewhere = await signIn('AnotherPass789!');
    await me(elsewhere.token).expect(200);

    const changed = await request(app.getHttpServer())
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${here.token}`)
      .set('Cookie', here.cookies)
      .send({ currentPassword: 'AnotherPass789!', newPassword: 'Blue-Mango-Kite-42' })
      .expect(200);

    // Both access tokens were signed before the change
    await me(elsewhere.token).expect(401);
    await me(here.token).expect(401);

    // The response starts a new session for this browser: a working token and a new refresh cookie
    await me(changed.body.access_token).expect(200);
    const fresh = (changed.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('np_refresh='))!;
    const viaNewCookie = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', fresh.split(';')[0]).expect(201);
    await me(viaNewCookie.body.access_token).expect(200);

    // This browser kept its refresh cookie and gets a new token; the other one didn't
    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', here.cookies).expect(201);
    await me(refreshed.body.access_token).expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', elsewhere.cookies).expect(401);
  });

  it('refuses a common new password', async () => {
    const { token } = await signIn('Blue-Mango-Kite-42');
    const res = await request(app.getHttpServer())
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Blue-Mango-Kite-42', newPassword: 'password123' })
      .expect(400);
    expect(res.body.message).toMatch(/too common/);
  });

  it('sign out everywhere cancels access and refresh tokens', async () => {
    const one = await signIn('Blue-Mango-Kite-42');
    const two = await signIn('Blue-Mango-Kite-42');

    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${one.token}`)
      .set('Cookie', one.cookies)
      .expect(201);

    await me(one.token).expect(401);
    await me(two.token).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', two.cookies).expect(401);
    expect(await app.get(PrismaService).refreshToken.count()).toBe(0);

    // Signing in again works as normal
    await me((await signIn('Blue-Mango-Kite-42')).token).expect(200);
  });
});
