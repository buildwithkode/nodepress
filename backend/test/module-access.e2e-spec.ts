import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

describe('Module access (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let editor: { id: number; token: string };
  let viewer: { id: number; token: string };

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);
    adminId = (await http().get('/api/auth/me').set(as(adminToken))).body.id;
    editor = await inviteUser(app, adminToken, 'editor@test.com', 'editor');
    viewer = await inviteUser(app, adminToken, 'viewer@test.com', 'viewer');
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('sends the signed-in user\'s access with /auth/me', async () => {
    const me = await http().get('/api/auth/me').set(as(editor.token)).expect(200);
    expect(me.body.access.modules).toMatchObject({ content: 'edit', media: 'edit', forms: 'edit', jobs: 'none', users: 'none' });
    expect(me.body.access.content['*']).toEqual(expect.arrayContaining(['create', 'publish']));
    const admin = await http().get('/api/auth/me').set(as(adminToken)).expect(200);
    expect(admin.body.access.modules.server_settings).toBe('edit');
  });

  it('lists modules and roles to admins only', async () => {
    const res = await http().get('/api/roles/access').set(as(adminToken)).expect(200);
    expect(res.body.modules.map((m: any) => m.key)).toEqual(expect.arrayContaining(['content', 'media', 'users']));
    expect(res.body.roles.map((r: any) => r.name)).toEqual(['editor', 'contributor', 'viewer']);
    await http().get('/api/roles/access').set(as(editor.token)).expect(403);
    await http().put('/api/roles/access/editor').set(as(editor.token)).send({ modules: { jobs: 'edit' } }).expect(403);
  });

  it('view opens reads, edit opens writes', async () => {
    await http().get('/api/jobs').set(as(editor.token)).expect(403);

    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { jobs: 'view' } }).expect(200);
    await http().get('/api/jobs').set(as(editor.token)).expect(200);
    await http().post('/api/jobs/retry-failed').set(as(editor.token)).expect(403);

    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { jobs: 'edit' } }).expect(200);
    await http().post('/api/jobs/retry-failed').set(as(editor.token)).expect(201);
  });

  it('can take access away from a built-in role', async () => {
    await http().get('/api/forms').set(as(editor.token)).expect(200);
    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { forms: 'none' } }).expect(200);
    await http().get('/api/forms').set(as(editor.token)).expect(403);
  });

  it('refuses unknown modules, bad levels, content and admin', async () => {
    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { nope: 'view' } }).expect(400);
    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { jobs: 'all' } }).expect(400);
    await http().put('/api/roles/access/editor').set(as(adminToken)).send({ modules: { content: 'edit' } }).expect(400);
    await http().put('/api/roles/access/admin').set(as(adminToken)).send({ modules: { jobs: 'none' } }).expect(404);
  });

  it('a non-admin with Users → edit manages users but never admins', async () => {
    await http().get('/api/users').set(as(viewer.token)).expect(403);
    await http().put('/api/roles/access/viewer').set(as(adminToken)).send({ modules: { users: 'edit' } }).expect(200);

    await http().get('/api/users').set(as(viewer.token)).expect(200);
    await http().get('/api/roles').set(as(viewer.token)).expect(200); // to pick a role
    await http().post('/api/users').set(as(viewer.token)).send({ email: 'new@test.com', role: 'contributor' }).expect(201);
    await http().post('/api/users').set(as(viewer.token)).send({ email: 'boss@test.com', role: 'admin' }).expect(403);
    await http().put(`/api/users/${editor.id}/role`).set(as(viewer.token)).send({ role: 'admin' }).expect(403);
    await http().put(`/api/users/${adminId}/role`).set(as(viewer.token)).send({ role: 'viewer' }).expect(403);
    await http().post(`/api/users/${adminId}/invite`).set(as(viewer.token)).expect(403);
    await http().delete(`/api/users/${adminId}`).set(as(viewer.token)).expect(403);
    await http().put(`/api/users/${viewer.id}/role`).set(as(viewer.token)).send({ role: 'editor' }).expect(403);
    // Roles and permissions themselves stay admin-only
    await http().get('/api/permissions').set(as(viewer.token)).expect(403);
  });

  it('reset restores every role\'s defaults', async () => {
    await http().put('/api/permissions/reset/all').set(as(adminToken)).expect(200);
    await http().get('/api/jobs').set(as(editor.token)).expect(403);
    await http().get('/api/forms').set(as(editor.token)).expect(200);
    await http().get('/api/users').set(as(viewer.token)).expect(403);
  });

  it('keeps the plugin list readable for the admin\'s nav, settings only for plugin editors', async () => {
    const res = await http().get('/api/plugins').set(as(viewer.token)).expect(200);
    expect(res.body.meta.uploads).toBeNull();
    await http().get('/api/plugins/hooks').set(as(viewer.token)).expect(403);
  });
});
