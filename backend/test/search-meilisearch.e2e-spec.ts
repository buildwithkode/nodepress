import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as http from 'http';
import { AddressInfo } from 'net';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { env } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';
import { SearchService, SEARCH_SYNC_JOB } from '../src/search/search.service';

/** Just enough of Meilisearch's HTTP API for the adapter: documents, deletes, filters, search. */
function fakeMeili() {
  const docs = new Map<number, any>();
  let down = false;
  const matches = (doc: any, filter = '') =>
    filter.split(' AND ').filter(Boolean).every((c) => {
      const [, key, raw] = /^(\w+) = (.+)$/.exec(c.trim())!;
      return String(doc[key]) === String(JSON.parse(raw));
    });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : null;
      const url = req.url!.split('?')[0];
      const send = (o: any) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      if (down) { res.statusCode = 503; return send({ message: 'down' }); }
      if (url.endsWith('/settings')) return send({ taskUid: 1 });
      if (url.endsWith('/documents') && req.method === 'POST') { json.forEach((d: any) => docs.set(d.id, d)); return send({ taskUid: 2 }); }
      if (url.endsWith('/documents') && req.method === 'DELETE') { docs.clear(); return send({ taskUid: 3 }); }
      if (url.endsWith('/documents/delete-batch')) { json.forEach((id: number) => docs.delete(id)); return send({ taskUid: 4 }); }
      if (url.endsWith('/documents/delete')) { for (const [id, d] of docs) if (matches(d, json.filter)) docs.delete(id); return send({ taskUid: 5 }); }
      if (url.endsWith('/search')) {
        const q = String(json.q).toLowerCase();
        const hits = [...docs.values()].filter((d) => matches(d, json.filter) && `${d.slug} ${d.text}`.toLowerCase().includes(q));
        return send({ hits: hits.slice(json.offset, json.offset + json.limit).map((d) => ({ id: d.id })), estimatedTotalHits: hits.length });
      }
      res.statusCode = 404; send({});
    });
  });
  return { server, docs, setDown: (v: boolean) => (down = v) };
}

describe('Meilisearch search adapter (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ctId: number;
  const meili = fakeMeili();
  const saved = { driver: env.SEARCH_DRIVER, url: env.MEILISEARCH_URL };
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const search = async (q: string) => (await request(app.getHttpServer()).get(`/api/article?search=${encodeURIComponent(q)}`).expect(200)).body;

  beforeAll(async () => {
    await new Promise<void>((r) => meili.server.listen(0, '127.0.0.1', r));
    (env as any).SEARCH_DRIVER = 'meilisearch';
    (env as any).MEILISEARCH_URL = `http://127.0.0.1:${(meili.server.address() as AddressInfo).port}`;
    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
    ctId = (await request(app.getHttpServer()).post('/api/content-types').set(auth())
      .send({ name: 'article', schema: [{ name: 'title', type: 'text' }, { name: 'body', type: 'richtext' }] }).expect(201)).body.id;
    for (const [slug, status, title] of [['zebra', 'published', 'Zebras of Kenya'], ['lion', 'published', 'Lions'], ['secret', 'draft', 'Zebra secrets']]) {
      await request(app.getHttpServer()).post('/api/entries').set(auth())
        .send({ contentTypeId: ctId, slug, status, data: { title, body: '<p>On the <strong>savanna</strong></p>' } }).expect(201);
    }
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
    (env as any).SEARCH_DRIVER = saved.driver;
    (env as any).MEILISEARCH_URL = saved.url;
    meili.server.close();
  });

  it('entry writes queue a sync; the index holds published entries only, HTML stripped', async () => {
    const jobs = await app.get(PrismaService).job.count({ where: { type: SEARCH_SYNC_JOB } });
    expect(jobs).toBeGreaterThanOrEqual(4); // content type + three entries
    await app.get(SearchService).sync({ all: true });
    expect([...meili.docs.values()].map((d) => d.slug).sort()).toEqual(['lion', 'zebra']);
    expect([...meili.docs.values()][0].text).toContain('On the savanna');
  });

  it('?search= is answered by Meilisearch', async () => {
    const res = await search('zebra');
    expect(res.meta.searchMode).toBe('meilisearch');
    expect(res.data.map((e: any) => e.slug)).toEqual(['zebra']);
    expect(res.meta.total).toBe(1);
  });

  it('unpublishing removes an entry from the index', async () => {
    const zebra = await app.get(PrismaService).entry.findFirst({ where: { slug: 'zebra' } });
    await request(app.getHttpServer()).put(`/api/entries/${zebra!.id}`).set(auth()).send({ status: 'draft' }).expect(200);
    await app.get(SearchService).sync({ entryIds: [zebra!.id] });
    expect((await search('zebra')).data).toEqual([]);
  });

  it('when Meilisearch is down, search falls back to Postgres', async () => {
    meili.setDown(true);
    try {
      const res = await search('lions');
      expect(res.meta.searchMode).toBe('fulltext');
      expect(res.data.map((e: any) => e.slug)).toEqual(['lion']);
    } finally {
      meili.setDown(false);
    }
  });

  it('admins can queue a reindex', async () => {
    const res = await request(app.getHttpServer()).post('/api/search/reindex').set(auth()).expect(201);
    expect(res.body).toEqual({ queued: true });
    expect((await request(app.getHttpServer()).get('/api/search/status').set(auth())).body.driver).toBe('meilisearch');
  });
});
