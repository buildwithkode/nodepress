import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin, inviteUser } from './helpers';
import { PluginHookBus } from '../src/plugin/plugin-hook-bus';
import { PluginEvents } from '../src/plugin/plugin.events';
import { PluginVetoError } from '../src/plugin/plugin-veto.error';

/** Plugin SDK through the real app: bundled plugins on PluginContext, veto, toggling. */
describe('Plugins (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contentTypeId: number;
  const events: Array<{ event: string; source?: string; slug?: string }> = [];

  const toggle = (id: string, enabled: boolean) =>
    request(app.getHttpServer())
      .patch(`/api/plugins/${id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled })
      .expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    await toggle('word-count', true);

    const bus = app.get(PluginHookBus);
    // A core-level listener standing in for a validating plugin.
    bus.on(PluginEvents.ENTRY_BEFORE_CREATE, (p: any) => {
      if (p?.data?.title === 'VETO') throw new PluginVetoError('Titles may not be VETO');
    });
    for (const event of [PluginEvents.ENTRY_AFTER_CREATE, PluginEvents.ENTRY_AFTER_UPDATE, PluginEvents.ENTRY_AFTER_DELETE, PluginEvents.ENTRY_AFTER_PUBLISH]) {
      bus.on(event, (p: any) => { events.push({ event, source: p?.source, slug: p?.slug }); });
    }

    const ct = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'story', schema: [{ name: 'title', type: 'text' }, { name: 'content', type: 'textarea' }] })
      .expect(201);
    contentTypeId = ct.body.id;
  });

  afterAll(async () => {
    await toggle('word-count', true);
    await app.close();
  });

  const createEntry = (slug: string, data: Record<string, any>) =>
    request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId, slug, status: 'draft', data });

  it('word-count (on PluginContext) annotates entries from the admin API', async () => {
    const res = await createEntry('wc-admin', { title: 'Hello', content: 'one two three four' }).expect(201);
    expect(res.body.data._word_count).toBe(4);
    expect(res.body.data._reading_time_minutes).toBe(1);
    // seo-analyzer runs too (keys are snake_case: the core lowercases data keys on save).
    expect(typeof res.body.data._seo_score).toBe('number');
    expect(Array.isArray(res.body.data._seo_suggestions)).toBe(true);
  });

  it('…and from the public write API (before-hooks now run there too)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/story')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'wc-public', data: { title: 'Hi', content: 'a b c' } })
      .expect(201);
    expect(res.body.data._word_count).toBe(3);
  });

  it('a disabled plugin stops running', async () => {
    await toggle('word-count', false);
    const res = await createEntry('wc-off', { title: 'Off', content: 'one two' }).expect(201);
    expect(res.body.data._word_count).toBeUndefined();
    await toggle('word-count', true);
  });

  it('a PluginVetoError rejects the write with 422 on both APIs and nothing is saved', async () => {
    const admin = await createEntry('vetoed', { title: 'VETO' }).expect(422);
    expect(admin.body.message).toBe('Titles may not be VETO');
    await request(app.getHttpServer())
      .post('/api/story')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'vetoed-public', data: { title: 'VETO' } })
      .expect(422);
    const list = await request(app.getHttpServer())
      .get(`/api/entries?contentTypeId=${contentTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const slugs = (list.body.data ?? list.body).map((e: any) => e.slug);
    expect(slugs).not.toContain('vetoed');
    expect(slugs).not.toContain('vetoed-public');
  });

  it('bulk publish and bulk delete fire hook events with their source', async () => {
    const a = await createEntry('bulk-a', { title: 'A' }).expect(201);
    const b = await createEntry('bulk-b', { title: 'B' }).expect(201);
    events.length = 0;

    await request(app.getHttpServer())
      .post('/api/entries/bulk-publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [a.body.id, b.body.id] })
      .expect((r) => { if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); });
    const published = events.filter((e) => e.event === PluginEvents.ENTRY_AFTER_PUBLISH).map((e) => e.slug).sort();
    expect(published).toEqual(['bulk-a', 'bulk-b']);
    expect(events.every((e) => e.source === 'bulk')).toBe(true);

    events.length = 0;
    await request(app.getHttpServer())
      .post('/api/entries/bulk-delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [a.body.id, b.body.id] })
      .expect((r) => { if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); });
    expect(events.filter((e) => e.event === PluginEvents.ENTRY_AFTER_DELETE).map((e) => e.slug).sort()).toEqual(['bulk-a', 'bulk-b']);
  });

  it('plugin settings are admin-only in the listing', async () => {
    const editor = await inviteUser(app, token, 'editor@test.com', 'editor');
    const res = await request(app.getHttpServer())
      .get('/api/plugins')
      .set('Authorization', `Bearer ${editor.token}`)
      .expect(200);
    for (const p of res.body.plugins) {
      expect(p.config).toEqual({});
      expect(p.configSchema).toEqual([]);
    }
    const admin = await request(app.getHttpServer()).get('/api/plugins').set('Authorization', `Bearer ${token}`).expect(200);
    expect(admin.body.plugins.find((p: any) => p.id === 'word-count').config.wordsPerMinute).toBe(200);
  });
});
