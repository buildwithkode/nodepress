import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Forms (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let formId: number;
  const formSlug = 'contact';

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

  it('POST /api/forms → creates a form', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Contact',
        slug: formSlug,
        fields: [
          { name: 'name',    type: 'text',  label: 'Name',    required: true },
          { name: 'email',   type: 'email', label: 'Email',   required: true },
          { name: 'message', type: 'textarea', label: 'Message', required: false },
        ],
      })
      .expect(201);

    formId = res.body.id;
    expect(res.body.slug).toBe(formSlug);
    expect(res.body.isActive).toBe(true);
  });

  it('POST /api/forms → 409 on duplicate slug', async () => {
    await request(app.getHttpServer())
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup', slug: formSlug, fields: [] })
      .expect(409);
  });

  it('POST /api/forms → 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/forms')
      .send({ name: 'No Auth', slug: 'no-auth', fields: [] })
      .expect(401);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/forms → returns paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ page: 1 });
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/forms → 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/forms')
      .expect(401);
  });

  // ── Get one ───────────────────────────────────────────────────────────────────

  it('GET /api/forms/:id → returns the form', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(formId);
    expect(res.body.slug).toBe(formSlug);
  });

  it('GET /api/forms/:id → 404 for non-existent form', async () => {
    await request(app.getHttpServer())
      .get('/api/forms/99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Update ────────────────────────────────────────────────────────────────────

  it('PUT /api/forms/:id → updates the form', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Contact Updated' })
      .expect(200);

    expect(res.body.name).toBe('Contact Updated');
  });

  it('PUT /api/forms/:id → toggles isActive', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    expect(res.body.isActive).toBe(false);

    // Re-activate for submission tests
    await request(app.getHttpServer())
      .put(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: true });
  });

  // ── Public submission ─────────────────────────────────────────────────────────

  it('POST /api/submit/:slug → accepts a valid submission', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/submit/${formSlug}`)
      .send({ name: 'John', email: 'john@example.com', message: 'Hello!' })
      .expect(201);

    expect(res.body.id).toBeDefined();
  });

  it('POST /api/submit/:slug → 404 for unknown form slug', async () => {
    await request(app.getHttpServer())
      .post('/api/submit/does-not-exist')
      .send({ name: 'John' })
      .expect(404);
  });

  // ── Submissions list ──────────────────────────────────────────────────────────

  it('GET /api/forms/:id/submissions → lists submissions (paginated)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].data.name).toBe('John');
  });

  it('GET /api/forms/submissions/recent → returns recent submissions across all forms', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/forms/submissions/recent')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
  });

  // ── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/forms/:id → 401 without auth', async () => {
    await request(app.getHttpServer())
      .delete(`/api/forms/${formId}`)
      .expect(401);
  });

  it('DELETE /api/forms/:id → deletes the form and its submissions', async () => {
    await request(app.getHttpServer())
      .delete(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
