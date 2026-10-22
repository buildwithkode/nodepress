import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReleasesService } from '../src/releases/releases.service';

describe('Content releases (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ctId: number;
  const ids: Record<string, number> = {};

  const http = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const entry = async (slug: string, status: string) => {
    ids[slug] = (await http().post('/api/entries').set(auth())
      .send({ contentTypeId: ctId, slug, status, data: { title: slug } }).expect(201)).body.id;
  };
  const publicSlugs = async () => (await http().get('/api/news?sort=slug:asc').expect(200)).body.data.map((e: any) => e.slug);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    ctId = (await http().post('/api/content-types').set(auth()).send({ name: 'news', schema: [{ name: 'title', type: 'text' }] }).expect(201)).body.id;
    await entry('draft-a', 'draft');
    await entry('draft-b', 'draft');
    await entry('live-c', 'published');
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  it('publishes, unpublishes and archives together', async () => {
    const release = (await http().post('/api/releases').set(auth()).send({ name: 'Launch' }).expect(201)).body;
    await http().post(`/api/releases/${release.id}/items`).set(auth()).send({ entryIds: [ids['draft-a'], ids['draft-b']] }).expect(201);
    const withItems = (await http().post(`/api/releases/${release.id}/items`).set(auth())
      .send({ entryIds: [ids['live-c']], action: 'unpublish' }).expect(201)).body;
    expect(withItems.items.map((i: any) => i.action)).toEqual(['publish', 'publish', 'unpublish']);
    await http().post(`/api/releases/${release.id}/items`).set(auth()).send({ entryIds: [999999] }).expect(400);

    expect(await publicSlugs()).toEqual(['live-c']); // nothing changes until it's published
    const published = (await http().post(`/api/releases/${release.id}/publish`).set(auth()).expect(201)).body;
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    expect(await publicSlugs()).toEqual(['draft-a', 'draft-b']); // the public cache was cleared too

    // Done releases are read-only and can't be published twice.
    await http().post(`/api/releases/${release.id}/publish`).set(auth()).expect(409);
    await http().post(`/api/releases/${release.id}/items`).set(auth()).send({ entryIds: [ids['live-c']] }).expect(409);
  });

  it('shows conflicts with other open releases', async () => {
    const r1 = (await http().post('/api/releases').set(auth()).send({ name: 'One' }).expect(201)).body;
    const r2 = (await http().post('/api/releases').set(auth()).send({ name: 'Two' }).expect(201)).body;
    await http().post(`/api/releases/${r1.id}/items`).set(auth()).send({ entryIds: [ids['live-c']] }).expect(201);
    const two = (await http().post(`/api/releases/${r2.id}/items`).set(auth())
      .send({ entryIds: [ids['live-c']], action: 'archive' }).expect(201)).body;
    expect(two.items[0].conflicts).toEqual([expect.objectContaining({ id: r1.id, name: 'One', action: 'publish' })]);
    await http().delete(`/api/releases/${r1.id}/items/${two.items[0].id}`).set(auth()).expect(404); // wrong release
    await http().delete(`/api/releases/${r2.id}/items/${two.items[0].id}`).set(auth()).expect(200);
    const list = (await http().get('/api/releases').set(auth()).expect(200)).body;
    expect(list.find((r: any) => r.id === r1.id).itemCount).toBe(1);
  });

  it('scheduled releases go out from the scheduler, once', async () => {
    const r = (await http().post('/api/releases').set(auth()).send({ name: 'Later' }).expect(201)).body;
    await entry('scheduled-d', 'draft');
    await http().post(`/api/releases/${r.id}/items`).set(auth()).send({ entryIds: [ids['scheduled-d']] }).expect(201);
    await http().put(`/api/releases/${r.id}/schedule`).set(auth()).send({ scheduledAt: new Date(Date.now() - 1000).toISOString() }).expect(400);
    const scheduled = (await http().put(`/api/releases/${r.id}/schedule`).set(auth())
      .send({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() }).expect(200)).body;
    expect(scheduled.status).toBe('scheduled');

    // Make it due, then run the cron twice (as two instances would).
    await app.get(PrismaService).release.update({ where: { id: r.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
    const svc = app.get(ReleasesService);
    await Promise.all([svc.publishDueReleases(), svc.publishDueReleases()]);
    expect((await http().get(`/api/releases/${r.id}`).set(auth()).expect(200)).body.status).toBe('published');
    expect(await publicSlugs()).toContain('scheduled-d');
  });

  it('a release with a deleted entry still publishes the rest; contributors are read-only', async () => {
    const r = (await http().post('/api/releases').set(auth()).send({ name: 'Partial' }).expect(201)).body;
    await entry('gone-e', 'draft');
    await entry('kept-f', 'draft');
    await http().post(`/api/releases/${r.id}/items`).set(auth()).send({ entryIds: [ids['gone-e'], ids['kept-f']] }).expect(201);
    await http().delete(`/api/entries/${ids['gone-e']}`).set(auth()).expect(200);
    await http().post(`/api/releases/${r.id}/publish`).set(auth()).expect(201);
    const slugs = await publicSlugs();
    expect(slugs).toContain('kept-f');
    expect(slugs).not.toContain('gone-e');

    const contributor = await inviteUser(app, token, 'c@test.com', 'contributor');
    await http().get('/api/releases').set(auth(contributor.token)).expect(200);
    await http().post('/api/releases').set(auth(contributor.token)).send({ name: 'Nope' }).expect(403);
  });
});
