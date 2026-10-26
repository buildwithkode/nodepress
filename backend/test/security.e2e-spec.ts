import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

/**
 * Access rules that used to be missing: tokens that aren't access tokens,
 * anonymous reads of schemas, GraphQL, media and forms.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: number;
  let editorToken: string;
  let contributorToken: string;
  let viewerToken: string;
  let publicTypeId: number;
  let privateTypeId: number;
  let publishedId: number;
  let draftId: number;
  let privateEntryId: number;

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const gql = (query: string, variables?: Record<string, unknown>, token?: string) => {
    const req = http().post('/graphql').set('Content-Type', 'application/json');
    if (token) req.set(bearer(token));
    return req.send({ query, variables });
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);
    adminId = (await http().get('/api/auth/me').set(bearer(adminToken))).body.id;
    editorToken = (await inviteUser(app, adminToken, 'editor@test.com', 'editor')).token;
    contributorToken = (await inviteUser(app, adminToken, 'contrib@test.com', 'contributor')).token;
    viewerToken = (await inviteUser(app, adminToken, 'viewer@test.com', 'viewer')).token;

    const pub = await http().post('/api/content-types').set(bearer(adminToken)).send({
      name: 'sec_post',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'internal_note', type: 'text', readRoles: ['admin', 'editor'] },
      ],
      previewUrl: 'https://site.example.com/blog/{slug}',
    }).expect(201);
    publicTypeId = pub.body.id;

    const priv = await http().post('/api/content-types').set(bearer(adminToken)).send({
      name: 'sec_secret',
      schema: [{ name: 'title', type: 'text' }],
      allowedMethods: [],
    }).expect(201);
    privateTypeId = priv.body.id;

    const entry = (contentTypeId: number, slug: string, status: string) =>
      http().post('/api/entries').set(bearer(adminToken))
        .send({ contentTypeId, slug, status, data: { title: slug, internal_note: 'hidden' } })
        .expect(201).then((r) => r.body.id as number);
    publishedId = await entry(publicTypeId, 'live', 'published');
    draftId = await entry(publicTypeId, 'wip', 'draft');
    privateEntryId = await entry(privateTypeId, 'secret', 'published');
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Tokens that are signed with JWT_SECRET but aren't access tokens ─────────

  describe('non-access tokens', () => {
    let tempToken: string;
    let previewToken: string;

    beforeAll(() => {
      const jwt = app.get(JwtService);
      // What POST /auth/login returns after the password step when 2FA is on
      tempToken = jwt.sign({ sub: adminId, email: 'admin@test.com', purpose: '2fa_pending' }, { expiresIn: '5m' });
      previewToken = jwt.sign({ sub: 'preview', entryId: draftId, publicId: 'x' }, { expiresIn: '1h' });
    });

    it('the 2FA temp token is not a login (JwtStrategy)', async () => {
      await http().get('/api/auth/me').set(bearer(tempToken)).expect(401);
      await http().get('/api/users').set(bearer(tempToken)).expect(401);
    });

    it('the 2FA temp token cannot write through the public API (JwtOrApiKeyGuard)', async () => {
      await http().post('/api/sec-post').set(bearer(tempToken))
        .send({ slug: 'nope', data: { title: 'x' } }).expect(401);
    });

    it('the 2FA temp token cannot read drafts (StageAccessGuard)', async () => {
      await http().get('/api/sec-post?stage=draft').set(bearer(tempToken)).expect(401);
    });

    it('the 2FA temp token is anonymous to GraphQL', async () => {
      const res = await gql('query($id: Int!) { entry(id: $id) { id } }', { id: draftId }, tempToken).expect(200);
      expect(res.body.data.entry).toBeNull();
    });

    it('a preview token is not a login', async () => {
      await http().get('/api/auth/me').set(bearer(previewToken)).expect(401);
    });

    it('a real access token still works', async () => {
      await http().get('/api/auth/me').set(bearer(adminToken)).expect(200);
    });
  });

  // ── Content type schemas ─────────────────────────────────────────────────────

  describe('GET /api/content-types', () => {
    it('anonymous: only public types, without restricted fields or previewUrl', async () => {
      const res = await http().get('/api/content-types').expect(200);
      const names = res.body.map((ct: any) => ct.name);
      expect(names).toContain('sec_post');
      expect(names).not.toContain('sec_secret');
      const post = res.body.find((ct: any) => ct.name === 'sec_post');
      expect(post.schema.map((f: any) => f.name)).toEqual(['title']);
      expect(post).not.toHaveProperty('previewUrl');
    });

    it('anonymous: a private type by id is 404, a public one is the public view', async () => {
      await http().get(`/api/content-types/${privateTypeId}`).expect(404);
      const res = await http().get(`/api/content-types/${publicTypeId}`).expect(200);
      expect(res.body.schema.map((f: any) => f.name)).toEqual(['title']);
    });

    it('anonymous: the generated form needs a login', async () => {
      await http().get(`/api/content-types/${publicTypeId}/form`).expect(401);
      await http().get(`/api/content-types/${publicTypeId}/form`).set(bearer(viewerToken)).expect(200);
    });

    it('signed in: every type and field', async () => {
      const res = await http().get('/api/content-types').set(bearer(viewerToken)).expect(200);
      expect(res.body.map((ct: any) => ct.name)).toEqual(expect.arrayContaining(['sec_post', 'sec_secret']));
      const post = res.body.find((ct: any) => ct.name === 'sec_post');
      expect(post.schema.map((f: any) => f.name)).toEqual(['title', 'internal_note']);
      expect(post.previewUrl).toBe('https://site.example.com/blog/{slug}');
    });

    it('a bad token is a 401, not the anonymous view', async () => {
      await http().get('/api/content-types').set(bearer('not-a-jwt')).expect(401);
    });
  });

  // ── GraphQL code-first queries ───────────────────────────────────────────────

  describe('GraphQL', () => {
    it('anonymous entries: published entries of public types only', async () => {
      const res = await gql('{ entries(limit: 100) { total data { id status } } }').expect(200);
      const ids = res.body.data.entries.data.map((e: any) => e.id);
      expect(ids).toEqual([publishedId]);
    });

    it('anonymous entries of a private type are empty, even when asked for by id', async () => {
      const res = await gql('query($ct: Int) { entries(contentTypeId: $ct) { total } }', { ct: privateTypeId }).expect(200);
      expect(res.body.data.entries.total).toBe(0);
    });

    it('anonymous entries search skips private types', async () => {
      const res = await gql('{ entries(search: "secret") { total } }').expect(200);
      expect(res.body.data.entries.total).toBe(0);
    });

    it('anonymous entry(id): null for drafts and private types', async () => {
      const q = 'query($id: Int!) { entry(id: $id) { id data } }';
      expect((await gql(q, { id: draftId })).body.data.entry).toBeNull();
      expect((await gql(q, { id: privateEntryId })).body.data.entry).toBeNull();
      const live = (await gql(q, { id: publishedId })).body.data.entry;
      expect(live.id).toBe(publishedId);
      expect(live.data).not.toHaveProperty('internal_note');
    });

    it('signed in: drafts and private types are visible', async () => {
      const q = 'query($id: Int!) { entry(id: $id) { id } }';
      expect((await gql(q, { id: draftId }, viewerToken)).body.data.entry.id).toBe(draftId);
      const list = await gql('{ entries(limit: 100) { total } }', undefined, viewerToken);
      expect(list.body.data.entries.total).toBe(3);
    });

    it('anonymous contentTypes: public types and fields only', async () => {
      const res = await gql('{ contentTypes { name schema } }').expect(200);
      expect(res.body.data.contentTypes.map((ct: any) => ct.name)).toEqual(['sec_post']);
      expect(res.body.data.contentTypes[0].schema.map((f: any) => f.name)).toEqual(['title']);
      const one = await gql('query($id: Int!) { contentType(id: $id) { name } }', { id: privateTypeId });
      expect(one.body.data.contentType).toBeNull();
    });

    it('signed in contentTypes: all of them', async () => {
      const res = await gql('{ contentTypes { name } }', undefined, viewerToken).expect(200);
      expect(res.body.data.contentTypes).toHaveLength(2);
    });
  });

  // ── Media library ────────────────────────────────────────────────────────────

  it('GET /api/media needs a login', async () => {
    await http().get('/api/media').expect(401);
    await http().get('/api/media').set(bearer(viewerToken)).expect(200);
  });

  // ── Forms ────────────────────────────────────────────────────────────────────

  describe('forms', () => {
    let formId: number;

    beforeAll(async () => {
      const res = await http().post('/api/forms').set(bearer(editorToken)).send({
        name: 'Contact',
        slug: 'sec-contact',
        fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      }).expect(201);
      formId = res.body.id;
    });

    it.each([
      ['viewer', () => viewerToken],
      ['contributor', () => contributorToken],
    ])('a %s cannot use the forms admin API', async (_role, token) => {
      const t = token();
      await http().get('/api/forms').set(bearer(t)).expect(403);
      await http().get(`/api/forms/${formId}`).set(bearer(t)).expect(403);
      await http().get(`/api/forms/${formId}/submissions`).set(bearer(t)).expect(403);
      await http().get('/api/forms/submissions/recent').set(bearer(t)).expect(403);
      await http().post('/api/forms').set(bearer(t)).send({ name: 'X', slug: 'x', fields: [] }).expect(403);
      await http().put(`/api/forms/${formId}`).set(bearer(t)).send({ name: 'Hacked' }).expect(403);
      await http().delete(`/api/forms/${formId}`).set(bearer(t)).expect(403);
    });

    it('an editor can manage forms and read submissions', async () => {
      await http().get(`/api/forms/${formId}/submissions`).set(bearer(editorToken)).expect(200);
      await http().put(`/api/forms/${formId}`).set(bearer(editorToken)).send({ name: 'Contact us' }).expect(200);
    });

    it('anonymous visitors can still submit', async () => {
      await http().post('/api/submit/sec-contact').send({ data: { email: 'a@b.co' } }).expect(201);
    });
  });
});
