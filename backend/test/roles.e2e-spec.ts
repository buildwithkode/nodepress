import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

describe('Custom roles (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let writerToken: string;
  let writerId: number;
  let blogId: number;
  let pageId: number;

  const http = () => request(app.getHttpServer());
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asWriter = () => ({ Authorization: `Bearer ${writerToken}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);

    const schema = [{ name: 'title', type: 'text' }];
    blogId = (await http().post('/api/content-types').set(asAdmin()).send({ name: 'blog', schema }).expect(201)).body.id;
    pageId = (await http().post('/api/content-types').set(asAdmin()).send({ name: 'page', schema }).expect(201)).body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('lists the built-in roles as read-only', async () => {
    const res = await http().get('/api/roles').set(asAdmin()).expect(200);
    expect(res.body.map((r: any) => r.name)).toEqual(['admin', 'editor', 'contributor', 'viewer']);
    expect(res.body.every((r: any) => r.builtIn)).toBe(true);
  });

  it('creates a custom role and seeds its base role\'s permissions', async () => {
    const res = await http().post('/api/roles').set(asAdmin())
      .send({ name: 'Blog Writer', label: 'Blog writer', baseRole: 'contributor' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'blog_writer', baseRole: 'contributor' });

    const perms = await http().get('/api/permissions/blog_writer').set(asAdmin()).expect(200);
    expect(perms.body).toEqual([expect.objectContaining({ contentType: '*', actions: ['create', 'read', 'update'] })]);

    const audit = await http().get('/api/audit-log').set(asAdmin()).query({ resource: 'role' }).expect(200);
    expect(audit.body.data).toEqual([expect.objectContaining({ action: 'created', resourceId: 'blog_writer' })]);
  });

  it('rejects built-in names, admin as base and renames', async () => {
    await http().post('/api/roles').set(asAdmin()).send({ name: 'editor', label: 'x', baseRole: 'viewer' }).expect(409);
    await http().post('/api/roles').set(asAdmin()).send({ name: 'boss', label: 'x', baseRole: 'admin' }).expect(400);
    await http().post('/api/roles').set(asAdmin()).send({ name: 'blog_writer', label: 'x', baseRole: 'viewer' }).expect(409);
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ name: 'renamed' }).expect(400);
    await http().put('/api/roles/viewer').set(asAdmin()).send({ label: 'x' }).expect(400);
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ description: 'Writes the blog' }).expect(200);
  });

  it('restricts the role to one content type and invites a user with it', async () => {
    await http().put('/api/permissions/blog_writer/*').set(asAdmin()).send({ actions: ['read'] }).expect(200);
    await http().put('/api/permissions/blog_writer/blog').set(asAdmin()).send({ actions: ['create', 'read', 'update'] }).expect(200);
    await http().put('/api/permissions/ghost/blog').set(asAdmin()).send({ actions: ['read'] }).expect(404);

    await http().post('/api/users').set(asAdmin()).send({ email: 'nobody@test.com', role: 'ghost' }).expect(400);
    ({ id: writerId, token: writerToken } = await inviteUser(app, adminToken, 'writer@test.com', 'blog_writer'));
    expect(writerToken).toBeTruthy();

    const users = await http().get('/api/users').set(asAdmin()).expect(200);
    expect(users.body.find((u: any) => u.id === writerId).role).toBe('blog_writer');
  });

  it('/auth/me exposes the base role and the custom role', async () => {
    const me = await http().get('/api/auth/me').set(asWriter()).expect(200);
    expect(me.body).toMatchObject({ role: 'contributor', customRole: 'blog_writer' });

    const login = await http().post('/api/auth/login').send({ email: 'writer@test.com', password: 'Password123!' }).expect(201);
    expect(login.body.user).toMatchObject({ role: 'contributor', customRole: 'blog_writer' });
  });

  it('can create in the allowed type but not another, and cannot publish', async () => {
    const entry = await http().post('/api/entries').set(asWriter())
      .send({ contentTypeId: blogId, slug: 'hello', data: { title: 'Hello' }, status: 'draft' })
      .expect(201);

    await http().post('/api/entries').set(asWriter())
      .send({ contentTypeId: pageId, slug: 'about', data: { title: 'About' }, status: 'draft' })
      .expect(403);

    await http().post('/api/entries').set(asWriter())
      .send({ contentTypeId: blogId, slug: 'live', data: { title: 'Live' }, status: 'published' })
      .expect(403);

    await http().put(`/api/entries/${entry.body.id}`).set(asWriter())
      .send({ data: { title: 'Hello again' } })
      .expect(200);

    await http().put(`/api/entries/${entry.body.id}`).set(asWriter())
      .send({ status: 'published' })
      .expect(403);

    await http().post(`/api/entries/${entry.body.id}/promote`).set(asWriter())
      .send({ status: 'published' })
      .expect(403);
  });

  it('the public write API applies the same content permissions', async () => {
    await http().post('/api/blog').set(asWriter()).send({ slug: 'via-api', data: { title: 'x' }, status: 'draft' }).expect(201);
    await http().post('/api/blog').set(asWriter()).send({ slug: 'via-api-live', data: { title: 'x' } }).expect(403);
    await http().post('/api/page').set(asWriter()).send({ slug: 'via-api', data: { title: 'x' }, status: 'draft' }).expect(403);
  });

  it('cannot reach admin-only routes', async () => {
    await http().get('/api/users').set(asWriter()).expect(403);
    await http().get('/api/roles').set(asWriter()).expect(403);
    await http().get('/api/permissions').set(asWriter()).expect(403);
    await http().post('/api/content-types').set(asWriter()).send({ name: 'nope', schema: [] }).expect(403);
  });

  it('changing the base role takes effect for the signed-in user', async () => {
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ baseRole: 'viewer' }).expect(200);
    const me = await http().get('/api/auth/me').set(asWriter()).expect(200);
    expect(me.body.role).toBe('viewer');
    // Viewers are blocked from writes by @Roles() before content permissions apply
    await http().post('/api/entries').set(asWriter())
      .send({ contentTypeId: blogId, slug: 'again', data: { title: 'x' }, status: 'draft' })
      .expect(403);
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ baseRole: 'contributor' }).expect(200);
  });

  it('a role still assigned to users cannot be deleted', async () => {
    const res = await http().delete('/api/roles/blog_writer').set(asAdmin()).expect(409);
    expect(res.body.userCount).toBe(1);

    await http().put(`/api/users/${writerId}/role`).set(asAdmin()).send({ role: 'viewer' }).expect(200);
    await http().delete('/api/roles/blog_writer').set(asAdmin()).expect(200);

    const perms = await http().get('/api/permissions/blog_writer').set(asAdmin()).expect(200);
    expect(perms.body).toEqual([]);
    const roles = await http().get('/api/roles').set(asAdmin()).expect(200);
    expect(roles.body.some((r: any) => r.name === 'blog_writer')).toBe(false);
  });
});
