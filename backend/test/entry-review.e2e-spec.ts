import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { SchedulerService } from '../src/scheduler/scheduler.service';

/** Review notes, share links and scheduled unpublish, against the real database. */
describe('Entry review: notes, share links, unpublish (e2e)', () => {
  let app: INestApplication;
  let admin: string;
  let editor: string;
  let viewer: string;
  let ctId: number;
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    admin = await registerAdmin(app);
    editor = (await inviteUser(app, admin, 'editor@test.com', 'editor')).token;
    viewer = (await inviteUser(app, admin, 'viewer@test.com', 'viewer')).token;
    const ct = await request(server()).post('/api/content-types').set(as(admin)).send({
      name: 'offers',
      schema: [
        { name: 'title', type: 'text' },
        { name: 'internal_notes', type: 'text', readRoles: ['admin'] },
      ],
    }).expect(201);
    ctId = ct.body.id;
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
  });

  const newEntry = async (slug: string, status: string, extra: Record<string, unknown> = {}) =>
    (await request(server()).post('/api/entries').set(as(admin))
      .send({ contentTypeId: ctId, slug, status, data: { title: slug, internal_notes: 'secret' }, ...extra }).expect(201)).body;

  const listed = async (id: number) => {
    const res = await request(server()).get(`/api/entries?contentTypeId=${ctId}&limit=100`).set(as(admin)).expect(200);
    return res.body.data.find((e: any) => e.id === id);
  };

  describe('review notes', () => {
    it('a change request shows in the list until the entry goes back to review', async () => {
      const entry = await newEntry('summer-offer', 'pending_review');

      // Viewers may read notes but not write them
      await request(server()).post(`/api/entries/${entry.id}/notes`).set(as(viewer)).send({ body: 'hi' }).expect(403);

      const added = await request(server()).post(`/api/entries/${entry.id}/notes`).set(as(admin))
        .send({ body: '  Fix the price  ', kind: 'changes' }).expect(201);
      expect(added.body).toEqual([expect.objectContaining({ kind: 'changes', body: 'Fix the price', resolvedAt: null, author: expect.objectContaining({ name: 'admin' }) })]);
      await request(server()).put(`/api/entries/${entry.id}`).set(as(admin)).send({ status: 'draft' }).expect(200);
      expect((await listed(entry.id)).openNotes).toBe(1);

      const read = await request(server()).get(`/api/entries/${entry.id}/notes`).set(as(viewer)).expect(200);
      expect(read.body).toHaveLength(1);

      // The writer sends it back to review: the request closes by itself
      await request(server()).put(`/api/entries/${entry.id}`).set(as(editor)).send({ status: 'pending_review' }).expect(200);
      expect((await listed(entry.id)).openNotes).toBe(0);
      const after = await request(server()).get(`/api/entries/${entry.id}/notes`).set(as(admin)).expect(200);
      expect(after.body[0].resolvedAt).not.toBeNull();
    });

    it('resolves, reopens and deletes notes; only the author or an admin deletes', async () => {
      const entry = await newEntry('winter-offer', 'draft');
      const [note] = (await request(server()).post(`/api/entries/${entry.id}/notes`).set(as(editor))
        .send({ body: 'Check the dates', kind: 'changes' }).expect(201)).body;

      let res = await request(server()).patch(`/api/entries/${entry.id}/notes/${note.id}`).set(as(admin)).send({ resolved: true }).expect(200);
      expect(res.body[0].resolvedBy).toEqual(expect.objectContaining({ name: 'admin' }));
      res = await request(server()).patch(`/api/entries/${entry.id}/notes/${note.id}`).set(as(admin)).send({ resolved: false }).expect(200);
      expect(res.body[0].resolvedAt).toBeNull();

      await request(server()).delete(`/api/entries/${entry.id}/notes/${note.id}`).set(as(viewer)).expect(403);
      await request(server()).delete(`/api/entries/${entry.id}/notes/${note.id}`).set(as(editor)).expect(200);
      await request(server()).post(`/api/entries/${entry.id}/notes`).set(as(admin)).send({ body: '' }).expect(400);
      await request(server()).post(`/api/entries/${entry.id}/notes`).set(as(admin)).send({ body: 'x', kind: 'shout' }).expect(400);
    });
  });

  describe('share links', () => {
    it('shows a draft without a login, hides admin-only fields, and stops working when revoked', async () => {
      const entry = await newEntry('spring-offer', 'draft');
      await request(server()).post(`/api/entries/${entry.id}/share-links`).set(as(viewer)).send({ days: 7 }).expect(403);
      await request(server()).post(`/api/entries/${entry.id}/share-links`).set(as(admin)).send({ days: 365 }).expect(400);

      const link = (await request(server()).post(`/api/entries/${entry.id}/share-links`).set(as(admin)).send({ days: 7 }).expect(201)).body;
      expect(link.token).toMatch(/^nps_[0-9a-f]{48}$/);

      const open = await request(server()).get(`/api/share/${link.token}`).expect(200);
      expect(open.headers['cache-control']).toContain('no-store');
      expect(open.body.entry).toEqual(expect.objectContaining({ slug: 'spring-offer', status: 'draft' }));
      expect(open.body.entry.data.title).toBe('spring-offer');
      expect(open.body.entry.data).not.toHaveProperty('internal_notes');
      expect(open.body.contentType.schema.map((f: any) => f.name)).toEqual(['title']);
      expect(open.body.previewToken).toBeNull();

      const links = await request(server()).get(`/api/entries/${entry.id}/share-links`).set(as(admin)).expect(200);
      expect(links.body).toEqual([expect.objectContaining({ id: link.id, createdBy: 'admin' })]);
      expect(JSON.stringify(links.body)).not.toContain(link.token);

      await request(server()).delete(`/api/entries/${entry.id}/share-links/${link.id}`).set(as(admin)).expect(200);
      await request(server()).get(`/api/share/${link.token}`).expect(404);
      await request(server()).get('/api/share/not-a-token').expect(404);
    });

    it('stops working when the entry is trashed', async () => {
      const entry = await newEntry('autumn-offer', 'draft');
      const link = (await request(server()).post(`/api/entries/${entry.id}/share-links`).set(as(admin)).send({ days: 1 }).expect(201)).body;
      await request(server()).delete(`/api/entries/${entry.id}`).set(as(admin)).expect(200);
      await request(server()).get(`/api/share/${link.token}`).expect(404);
    });

    it('"share" is reserved as a content type name', async () => {
      await request(server()).post('/api/content-types').set(as(admin)).send({ name: 'share', schema: [] }).expect(400);
    });
  });

  describe('scheduled unpublish', () => {
    it('takes a published entry off the site when its time passes, and keeps future ones', async () => {
      const due = await newEntry('flash-sale', 'published', { unpublishAt: new Date(Date.now() - 60_000).toISOString() });
      const later = await newEntry('long-sale', 'published', { unpublishAt: new Date(Date.now() + 86_400_000).toISOString() });
      await request(server()).get('/api/offers/flash-sale').expect(200);

      await app.get(SchedulerService).unpublishScheduledEntries();

      const dueNow = (await request(server()).get(`/api/entries/${due.id}`).set(as(admin)).expect(200)).body;
      expect(dueNow).toEqual(expect.objectContaining({ status: 'draft', unpublishAt: null }));
      await request(server()).get('/api/offers/flash-sale').expect(404);

      const laterNow = (await request(server()).get(`/api/entries/${later.id}`).set(as(admin)).expect(200)).body;
      expect(laterNow.status).toBe('published');
      expect(laterNow.unpublishAt).not.toBeNull();
    });

    it('sets and clears the date through the entries API', async () => {
      const entry = await newEntry('weekend-sale', 'published');
      const at = new Date(Date.now() + 3_600_000).toISOString();
      let res = await request(server()).put(`/api/entries/${entry.id}`).set(as(admin)).send({ unpublishAt: at }).expect(200);
      expect(res.body.unpublishAt).toBe(at);
      res = await request(server()).put(`/api/entries/${entry.id}`).set(as(admin)).send({ unpublishAt: null }).expect(200);
      expect(res.body.unpublishAt).toBeNull();
    });
  });
});
