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

  it('GraphQL entry mutations apply the same content permissions', async () => {
    const gql = (query: string) => http().post('/graphql').set(asWriter()).send({ query });
    const ok = await gql(`mutation { createEntry(contentTypeId: ${blogId}, slug: "via-gql", status: "draft", data: "{\\"title\\":\\"x\\"}") { id } }`).expect(200);
    expect(ok.body.errors).toBeUndefined();
    const otherType = await gql(`mutation { createEntry(contentTypeId: ${pageId}, slug: "via-gql", status: "draft", data: "{\\"title\\":\\"x\\"}") { id } }`);
    expect(otherType.body.errors?.[0]?.message).toMatch(/permission to create entries of: page/);
    const publish = await gql(`mutation { updateEntry(id: ${ok.body.data.createEntry.id}, status: "published") { id } }`);
    expect(publish.body.errors?.[0]?.message).toMatch(/permission to publish entries of: blog/);
  });

  it('cannot reach admin-only routes', async () => {
    await http().get('/api/users').set(asWriter()).expect(403);
    await http().get('/api/roles').set(asWriter()).expect(403);
    await http().get('/api/permissions').set(asWriter()).expect(403);
    await http().post('/api/content-types').set(asWriter()).send({ name: 'nope', schema: [] }).expect(403);
  });

  it('changing the base role takes effect for the signed-in user', async () => {
    // Module access with no saved row follows the base role: editors get Forms, contributors don't.
    await http().get('/api/forms').set(asWriter()).expect(403);
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ baseRole: 'editor' }).expect(200);
    const me = await http().get('/api/auth/me').set(asWriter()).expect(200);
    expect(me.body.role).toBe('editor');
    expect(me.body.access.modules.forms).toBe('edit');
    await http().get('/api/forms').set(asWriter()).expect(200);
    await http().put('/api/roles/blog_writer').set(asAdmin()).send({ baseRole: 'contributor' }).expect(200);
    await http().get('/api/forms').set(asWriter()).expect(403);
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

describe('Custom roles — field rules, bulk routes, reset and base role changes (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let reviewerToken: string;
  let contributorToken: string;
  let blogId: number;
  let newsId: number;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const EDITOR_DEFAULTS = ['create', 'read', 'update', 'delete', 'publish'];

  const createEntry = async (contentTypeId: number, slug: string, data: Record<string, unknown> = { title: slug }) =>
    (await http().post('/api/entries').set(as(adminToken))
      .send({ contentTypeId, slug, data, status: 'draft' }).expect(201)).body.id as number;
  const statusOf = async (id: number) =>
    (await http().get(`/api/entries/${id}`).set(as(adminToken)).expect(200)).body.status;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);

    blogId = (await http().post('/api/content-types').set(as(adminToken)).send({
      name: 'blog',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'review_notes', type: 'text', readRoles: ['reviewer'], writeRoles: ['reviewer'] },
        { name: 'margin', type: 'text', readRoles: ['editor'], writeRoles: ['editor'] },
      ],
    }).expect(201)).body.id;
    newsId = (await http().post('/api/content-types').set(as(adminToken))
      .send({ name: 'news', schema: [{ name: 'title', type: 'text' }] }).expect(201)).body.id;

    await http().post('/api/roles').set(as(adminToken))
      .send({ name: 'reviewer', label: 'Reviewer', baseRole: 'editor' }).expect(201);
    // Reviewers may edit news but not publish or delete it.
    await http().put('/api/permissions/reviewer/news').set(as(adminToken))
      .send({ actions: ['create', 'read', 'update'] }).expect(200);

    ({ token: reviewerToken } = await inviteUser(app, adminToken, 'reviewer@test.com', 'reviewer'));
    ({ token: contributorToken } = await inviteUser(app, adminToken, 'contrib@test.com', 'contributor'));
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  describe('field rules match the custom role or the base role', () => {
    let entryId: number;
    beforeAll(async () => {
      entryId = await createEntry(blogId, 'secret', { title: 'T', review_notes: 'notes', margin: '10%' });
    });

    it('reads', async () => {
      const asReviewer = await http().get(`/api/entries/${entryId}`).set(as(reviewerToken)).expect(200);
      expect(asReviewer.body.data).toMatchObject({ title: 'T', review_notes: 'notes', margin: '10%' });

      const list = await http().get('/api/entries').query({ contentTypeId: blogId }).set(as(reviewerToken)).expect(200);
      expect(list.body.data[0].data).toMatchObject({ review_notes: 'notes', margin: '10%' });

      const asContributor = await http().get(`/api/entries/${entryId}`).set(as(contributorToken)).expect(200);
      expect(asContributor.body.data.title).toBe('T');
      expect(asContributor.body.data).not.toHaveProperty('review_notes');
      expect(asContributor.body.data).not.toHaveProperty('margin');
    });

    it('writes', async () => {
      await http().put(`/api/entries/${entryId}`).set(as(reviewerToken))
        .send({ data: { title: 'T', review_notes: 'changed', margin: '12%' } }).expect(200);
      await http().put(`/api/entries/${entryId}`).set(as(contributorToken))
        .send({ data: { title: 'T', review_notes: 'hijack' } }).expect(403);
    });
  });

  describe('bulk routes check each affected content type', () => {
    let blogEntry: number;
    let newsEntry: number;
    beforeAll(async () => {
      blogEntry = await createEntry(blogId, 'bulk-blog');
      newsEntry = await createEntry(newsId, 'bulk-news');
    });

    it('rejects the whole bulk publish when one type is not allowed', async () => {
      const res = await http().post('/api/entries/bulk-publish').set(as(reviewerToken))
        .send({ ids: [blogEntry, newsEntry] }).expect(403);
      expect(res.body.forbiddenContentTypes).toEqual(['news']);
      expect(await statusOf(blogEntry)).toBe('draft');

      await http().post('/api/entries/bulk-publish').set(as(reviewerToken)).send({ ids: [blogEntry] }).expect(201);
      expect(await statusOf(blogEntry)).toBe('published');
    });

    it('checks publish for published / staging / archive, delete on bulk-delete, update otherwise', async () => {
      await http().post('/api/entries/bulk-promote').set(as(reviewerToken))
        .send({ ids: [newsEntry], status: 'published' }).expect(403);
      await http().post('/api/entries/bulk-promote').set(as(reviewerToken))
        .send({ ids: [newsEntry], status: 'staging' }).expect(403);
      await http().post('/api/entries/bulk-promote').set(as(reviewerToken))
        .send({ ids: [newsEntry], status: 'pending_review' }).expect(201);
      await http().post('/api/entries/bulk-delete').set(as(reviewerToken))
        .send({ ids: [blogEntry, newsEntry] }).expect(403);
      const archive = await http().post('/api/entries/bulk-archive').set(as(reviewerToken))
        .send({ ids: [blogEntry, newsEntry] }).expect(403);
      expect(archive.body.forbiddenContentTypes).toEqual(['news']);
      await http().post('/api/entries/bulk-archive').set(as(reviewerToken)).send({ ids: [blogEntry] }).expect(201);
      expect(await statusOf(blogEntry)).toBe('archived');
      expect(await statusOf(newsEntry)).toBe('pending_review');
    });

    it('admin passes', async () => {
      await http().post('/api/entries/bulk-delete').set(as(adminToken))
        .send({ ids: [blogEntry, newsEntry] }).expect(201);
    });
  });

  it('reset to defaults re-seeds custom roles from their base role', async () => {
    await http().put('/api/permissions/reset/all').set(as(adminToken)).expect(200);
    const perms = await http().get('/api/permissions/reviewer').set(as(adminToken)).expect(200);
    expect(perms.body).toEqual([expect.objectContaining({ contentType: '*', actions: EDITOR_DEFAULTS })]);
    const all = await http().get('/api/permissions').set(as(adminToken)).expect(200);
    expect(all.body.map((p: any) => `${p.role}/${p.contentType}`).sort())
      .toEqual(['contributor/*', 'editor/*', 'reviewer/*', 'viewer/*']);
  });

  it('changing the base role replaces default permissions but keeps customised ones', async () => {
    await http().post('/api/roles').set(as(adminToken))
      .send({ name: 'helper', label: 'Helper', baseRole: 'contributor' }).expect(201);

    const changed = await http().put('/api/roles/helper').set(as(adminToken)).send({ baseRole: 'editor' }).expect(200);
    expect(changed.body).toMatchObject({ baseRole: 'editor', warnings: [] });
    let perms = await http().get('/api/permissions/helper').set(as(adminToken)).expect(200);
    expect(perms.body).toEqual([expect.objectContaining({ contentType: '*', actions: EDITOR_DEFAULTS })]);

    await http().put('/api/permissions/helper/*').set(as(adminToken)).send({ actions: ['read', 'update'] }).expect(200);
    const kept = await http().put('/api/roles/helper').set(as(adminToken)).send({ baseRole: 'viewer' }).expect(200);
    expect(kept.body.baseRole).toBe('viewer');
    expect(kept.body.warnings).toHaveLength(1);
    perms = await http().get('/api/permissions/helper').set(as(adminToken)).expect(200);
    expect(perms.body).toEqual([expect.objectContaining({ contentType: '*', actions: ['read', 'update'] })]);

    // A label-only change never touches permissions.
    const label = await http().put('/api/roles/helper').set(as(adminToken)).send({ label: 'Helpers' }).expect(200);
    expect(label.body.warnings).toEqual([]);
  });
});
