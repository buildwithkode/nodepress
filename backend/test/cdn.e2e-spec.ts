import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { env } from '../src/config/env';

async function waitFor<T>(check: () => T | undefined | null | false, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('CDN caching (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let receiver: Server;
  const purges: { tags: string[]; signature?: string }[] = [];
  const saved = { ...env };

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        purges.push({ ...JSON.parse(raw), signature: req.headers['x-nodepress-signature'] as string });
        res.end('ok');
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    Object.assign(env, {
      CDN_PURGE_DRIVER: 'webhook',
      CDN_PURGE_WEBHOOK_URL: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/purge`,
      CDN_PURGE_WEBHOOK_SECRET: 'e2e-secret',
      CDN_CACHE_TTL: undefined,
    });

    app = await createTestApp();
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
    Object.assign(env, saved);
    await new Promise((r) => receiver.close(r));
  });

  it('tags public responses and purges only the changed content type', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const news = await request(server).post('/api/content-types').set(auth)
      .send({ name: 'news', schema: [{ name: 'title', type: 'text' }] }).expect(201);
    const other = await request(server).post('/api/content-types').set(auth)
      .send({ name: 'faq', schema: [{ name: 'title', type: 'text' }] }).expect(201);
    const entry = await request(server).post('/api/entries').set(auth)
      .send({ contentTypeId: news.body.id, slug: 'n1', status: 'published', data: { title: 'One' } }).expect(201);

    const list = await request(server).get('/api/news').expect(200);
    expect(list.headers['cache-control']).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=60');
    expect(list.headers['cache-tag']).toBe(`np-all,np-ct-${news.body.id}`);
    expect(list.headers['surrogate-key']).toBe(`np-all np-ct-${news.body.id}`);
    const one = await request(server).get('/api/news/n1').expect(200);
    expect(one.headers['cache-tag']).toBe(`np-all,np-ct-${news.body.id}`);

    // Drafts are private and untagged.
    const draft = await request(server).get('/api/news?stage=draft').set(auth).expect(200);
    expect(draft.headers['cache-control']).toBe('private, no-store');
    expect(draft.headers['cache-tag']).toBeUndefined();

    // Let the purge batched from the setup writes go out first.
    await waitFor(() => purges.find((p) => p.tags.includes(`np-ct-${other.body.id}`)));
    purges.length = 0;
    await request(server).put(`/api/entries/${entry.body.id}`).set(auth).send({ data: { title: 'Two' } }).expect(200);

    const purge = await waitFor(() => purges.find((p) => p.tags.includes(`np-ct-${news.body.id}`)));
    expect(purge.tags).not.toContain(`np-ct-${other.body.id}`);
    expect(purge.tags).not.toContain('np-all');
    expect(purge.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
