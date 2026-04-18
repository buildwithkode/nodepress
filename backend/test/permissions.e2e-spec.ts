import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

describe('Permissions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let editorToken: string;
  let contributorToken: string;
  let contentTypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);

    // Create editor and contributor users
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'editor@test.com', password: 'Password123!', role: 'editor' });

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'contributor@test.com', password: 'Password123!', role: 'contributor' });

    const editorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'editor@test.com', password: 'Password123!' });
    editorToken = editorLogin.body.access_token;

    const contributorLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'contributor@test.com', password: 'Password123!' });
    contributorToken = contributorLogin.body.access_token;

    // Create a content type
    const ctRes = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'permpost', schema: [{ name: 'title', type: 'text', required: true }] });
    contentTypeId = ctRes.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  // ── Auth guard ────────────────────────────────────────────────────────────────

  it('GET /api/permissions → 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/permissions')
      .expect(401);
  });

  it('GET /api/permissions → 403 for non-admin', async () => {
    await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(403);
  });

  // ── List ──────────────────────────────────────────────────────────────────────

  it('GET /api/permissions → returns array (admin only)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Get by role ───────────────────────────────────────────────────────────────

  it('GET /api/permissions/editor → returns permissions for editor role', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/permissions/editor')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Upsert ────────────────────────────────────────────────────────────────────

  it('PUT /api/permissions/editor/permpost → sets allowed actions for role on content type', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/permissions/editor/permpost')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actions: ['read'] })
      .expect(200);

    expect(res.body.role).toBe('editor');
    expect(res.body.contentType).toBe('permpost');
    expect(res.body.actions).toContain('read');
  });

  it('PUT /api/permissions/editor/permpost → restricting to read blocks editor from deleting', async () => {
    // First create an entry as admin
    const entry = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contentTypeId, slug: 'perm-test-entry', status: 'published', data: { title: 'Perm Test' } });

    // Editor restricted to read — delete should be forbidden
    await request(app.getHttpServer())
      .delete(`/api/entries/${entry.body.id}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(403);
  });

  it('PUT /api/permissions/editor/permpost → restoring full permissions re-enables delete', async () => {
    // Restore full editor permissions
    await request(app.getHttpServer())
      .put('/api/permissions/editor/permpost')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actions: ['create', 'read', 'update', 'delete', 'publish'] });

    // Now create a new entry and delete it as editor
    const entry = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contentTypeId, slug: 'perm-restore-entry', status: 'published', data: { title: 'Perm Restore' } });

    await request(app.getHttpServer())
      .delete(`/api/entries/${entry.body.id}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
  });

  // ── Delete override ───────────────────────────────────────────────────────────

  it('DELETE /api/permissions/editor/permpost → removes the override (falls back to wildcard)', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/permissions/editor/permpost')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.message).toBeDefined();
  });

  // ── Reset all ─────────────────────────────────────────────────────────────────

  it('PUT /api/permissions/reset/all → resets all overrides to defaults', async () => {
    // First set a custom permission
    await request(app.getHttpServer())
      .put('/api/permissions/contributor/permpost')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actions: [] });

    // Reset all
    const res = await request(app.getHttpServer())
      .put('/api/permissions/reset/all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.message).toBeDefined();
  });

  // ── Default role enforcement ──────────────────────────────────────────────────

  it('contributor → cannot delete entries by default', async () => {
    const entry = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contentTypeId, slug: 'contrib-delete', status: 'published', data: { title: 'Contrib Delete' } });

    await request(app.getHttpServer())
      .delete(`/api/entries/${entry.body.id}`)
      .set('Authorization', `Bearer ${contributorToken}`)
      .expect(403);
  });

  it('contributor → can create entries by default', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${contributorToken}`)
      .send({ contentTypeId, slug: 'contrib-create', status: 'draft', data: { title: 'Contrib Create' } })
      .expect(201);

    expect(res.body.slug).toBe('contrib-create');
  });
});
