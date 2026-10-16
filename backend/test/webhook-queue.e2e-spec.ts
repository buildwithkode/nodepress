import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';

/** Poll until `check` returns a truthy value (or time out). */
async function waitFor<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Webhook delivery queue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let webhooks: WebhooksService;
  let token: string;
  let receiver: Server;
  let receiverUrl: string;
  let received: { headers: IncomingMessage['headers']; body: any }[] = [];
  let respondWith = 200;

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body: JSON.parse(raw || '{}') });
        res.statusCode = respondWith;
        res.end();
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;

    app = await createTestApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(WebhooksService);
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(app);
    await app.close();
    await new Promise((r) => receiver.close(r));
  });

  beforeEach(async () => {
    received = [];
    respondWith = 200;
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
  });

  async function createHook(events: string[] = ['*']) {
    const res = await request(app.getHttpServer())
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Receiver', url: receiverUrl, events, secret: 'queue-secret' })
      .expect(201);
    return res.body.id as number;
  }

  it('a content write is delivered by the worker and marked delivered', async () => {
    const hookId = await createHook();
    const ct = await request(app.getHttpServer())
      .post('/api/content-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'post', schema: [{ name: 'title', type: 'text' }] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/entries')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentTypeId: ct.body.id, slug: 'queued', status: 'published', data: { title: 'Hi' } })
      .expect(201);

    const delivery = await waitFor(() =>
      prisma.webhookDelivery.findFirst({ where: { webhookId: hookId, status: 'delivered' } }),
    );
    expect(delivery.attempts).toBe(1);
    expect(delivery.responseStatus).toBe(200);
    expect(delivery.nextRetryAt).toBeNull();

    const hit = received.find((r) => r.body.event === 'entry.created');
    expect(hit?.headers['x-nodepress-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(hit?.headers['x-nodepress-attempt']).toBe('1');
  });

  it('a failing receiver gets the delivery rescheduled with backoff', async () => {
    respondWith = 500;
    const hookId = await createHook();
    await webhooks.enqueue('entry.updated', { id: 1 });

    const delivery = await waitFor(() =>
      prisma.webhookDelivery.findFirst({ where: { webhookId: hookId, errorMessage: 'HTTP 500' } }),
    );
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(1);
    // Next attempt ~5 minutes out, not immediately.
    expect(delivery.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  });

  it('concurrent claims never return the same delivery twice', async () => {
    const hookId = await createHook();
    // Park rows in the future so the running worker leaves them alone, then make them due.
    await prisma.webhookDelivery.createMany({
      data: Array.from({ length: 40 }, (_, i) => ({
        webhookId: hookId, event: 'entry.created', payload: { i }, status: 'pending', attempts: 0,
        nextRetryAt: new Date(Date.now() + 3_600_000),
      })),
    });
    // Disable the hook so anything the worker does claim is failed, not sent.
    await prisma.webhook.update({ where: { id: hookId }, data: { enabled: false } });
    await prisma.webhookDelivery.updateMany({ where: { webhookId: hookId }, data: { nextRetryAt: new Date(Date.now() - 1_000) } });

    const batches = await Promise.all([webhooks.claimDue(15), webhooks.claimDue(15), webhooks.claimDue(15)]);
    const ids = batches.flat().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of batches.flat()) {
      expect(d.attempts).toBe(1);
      // Leased about a minute into the future (UTC-correct regardless of DB time zone).
      expect(new Date(d.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 30_000);
    }
  });

  it('a delivery whose worker died is picked up again after its lease', async () => {
    const hookId = await createHook();
    // Claimed once (attempts=1), lease already expired — as if the worker crashed mid-send.
    await prisma.webhookDelivery.create({
      data: { webhookId: hookId, event: 'entry.deleted', payload: { id: 9 }, status: 'pending', attempts: 1, nextRetryAt: new Date(Date.now() - 1_000) },
    });

    const delivery = await waitFor(() =>
      prisma.webhookDelivery.findFirst({ where: { webhookId: hookId, status: 'delivered' } }),
    );
    expect(delivery.attempts).toBe(2);
  });

  it('an interrupted final attempt is failed instead of retried forever', async () => {
    const hookId = await createHook();
    await prisma.webhookDelivery.create({
      data: { webhookId: hookId, event: 'entry.deleted', payload: {}, status: 'pending', attempts: 3, nextRetryAt: new Date(Date.now() - 1_000) },
    });

    expect(await webhooks.failAbandoned()).toBe(1);
    const row = await prisma.webhookDelivery.findFirst({ where: { webhookId: hookId } });
    expect(row).toMatchObject({ status: 'failed', errorMessage: 'Delivery interrupted', nextRetryAt: null });
  });
});
