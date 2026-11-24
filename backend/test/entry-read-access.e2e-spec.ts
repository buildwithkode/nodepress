import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';

/**
 * A role with "No access" to a content type can't read its entries through the
 * admin API either: not in the list, the counts, one entry, its versions,
 * `?populate=` or GraphQL. Types the role may read work as before.
 */
describe('Entry reads follow the role (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  const ct: Record<string, number> = {};
  const entry: Record<string, { id: number; publicId: string }> = {};

  const http = () => request(app.getHttpServer());
  const asUser = () => ({ Authorization: `Bearer ${userToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const gql = (query: string) =>
    http().post('/graphql').set(asUser()).set('Content-Type', 'application/json').send(JSON.stringify({ query })).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    adminToken = await registerAdmin(app);

    // secret: no access for the role · event: the role's own type, with a relation to secret · open: no row, base role's default
    for (const [name, schema] of [
      ['secret', [{ name: 'title', type: 'text' }]],
      ['open', [{ name: 'title', type: 'text' }]],
      ['event', [
        { name: 'title', type: 'text' },
        { name: 'host', type: 'relation', options: { relatedContentType: 'secret', cardinality: 'one' } },
      ]],
    ] as const) {
      ct[name] = (await http().post('/api/content-types').set(asAdmin()).send({ name, schema }).expect(201)).body.id;
    }
    for (const name of ['secret', 'open']) {
      const res = await http().post('/api/entries').set(asAdmin())
        .send({ contentTypeId: ct[name], slug: `${name}-draft`, status: 'draft', data: { title: `${name} draft` } }).expect(201);
      entry[name] = { id: res.body.id, publicId: res.body.publicId };
    }
    const ev = await http().post('/api/entries').set(asAdmin())
      .send({ contentTypeId: ct.event, slug: 'meetup', status: 'draft', data: { title: 'Meetup', host: entry.secret.publicId } }).expect(201);
    entry.event = { id: ev.body.id, publicId: ev.body.publicId };

    await http().post('/api/roles').set(asAdmin()).send({ name: 'event_manager', label: 'Event manager', baseRole: 'contributor' }).expect(201);
    await http().put('/api/permissions/event_manager/event').set(asAdmin()).send({ actions: ['create', 'read', 'update', 'publish'] }).expect(200);
    await http().put('/api/permissions/event_manager/secret').set(asAdmin()).send({ actions: [] }).expect(200);
    ({ token: userToken } = await inviteUser(app, adminToken, 'maya@test.com', 'event_manager'));
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('lists only the content types the role may read', async () => {
    const res = await http().get('/api/entries').query({ limit: 100 }).set(asUser()).expect(200);
    const slugs = res.body.data.map((e: any) => e.slug);
    expect(slugs).toEqual(expect.arrayContaining(['open-draft', 'meetup']));
    expect(slugs).not.toContain('secret-draft');

    const searched = await http().get('/api/entries').query({ search: 'draft' }).set(asUser()).expect(200);
    expect(searched.body.data.map((e: any) => e.slug)).not.toContain('secret-draft');

    const grouped = await http().get('/api/entries').query({ group: 'true' }).set(asUser()).expect(200);
    expect(grouped.body.data.map((e: any) => e.slug)).not.toContain('secret-draft');
  });

  it('refuses the list of a content type the role may not read', async () => {
    await http().get('/api/entries').query({ contentTypeId: ct.secret }).set(asUser()).expect(403);
    await http().get('/api/entries').query({ contentTypeId: ct.event }).set(asUser()).expect(200);
  });

  it('refuses one entry and its versions', async () => {
    await http().get(`/api/entries/${entry.secret.id}`).set(asUser()).expect(403);
    await http().get(`/api/entries/${entry.secret.id}/versions`).set(asUser()).expect(403);
    await http().get(`/api/entries/${entry.open.id}`).set(asUser()).expect(200);
    await http().get(`/api/entries/${entry.event.id}/versions`).set(asUser()).expect(200);
  });

  it('leaves out counts of content types the role may not read', async () => {
    const res = await http().get('/api/entries/counts').set(asUser()).expect(200);
    expect(res.body.totals[ct.secret]).toBeUndefined();
    expect(res.body.totals[ct.event]).toBe(1);
  });

  it('keeps a relation to an unreadable content type as its id', async () => {
    const res = await http().get(`/api/entries/${entry.event.id}`).query({ populate: 'host' }).set(asUser()).expect(200);
    expect(res.body.data.host).toBe(entry.secret.publicId);

    const admin = await http().get(`/api/entries/${entry.event.id}`).query({ populate: 'host' }).set(asAdmin()).expect(200);
    expect(admin.body.data.host).toMatchObject({ slug: 'secret-draft' });
  });

  it('GraphQL entries and entry follow the same rules', async () => {
    const list = await gql('{ entries(limit: 100) { data { slug } } }');
    expect(list.body.data.entries.data.map((e: any) => e.slug)).not.toContain('secret-draft');

    const one = await gql(`{ entry(id: ${entry.secret.id}) { slug } }`);
    expect(one.body.data.entry).toBeNull();
    const own = await gql(`{ entry(id: ${entry.event.id}) { slug } }`);
    expect(own.body.data.entry).toMatchObject({ slug: 'meetup' });
  });

  it('an admin still sees everything', async () => {
    const res = await http().get('/api/entries').query({ limit: 100 }).set(asAdmin()).expect(200);
    expect(res.body.data.map((e: any) => e.slug)).toContain('secret-draft');
    await http().get(`/api/entries/${entry.secret.id}`).set(asAdmin()).expect(200);
  });
});
