import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { JobsService } from '../src/jobs/jobs.service';
import { MailService } from '../src/mail/mail.service';

async function waitFor<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Form actions via the job queue (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let receiver: Server;
  let receiverUrl: string;
  let received: any[] = [];
  let respondWith = 200;
  let respondDelayMs = 0;

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        received.push(JSON.parse(raw || '{}'));
        setTimeout(() => { res.statusCode = respondWith; res.end(); }, respondDelayMs);
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/form-hook`;

    app = await createTestApp();
    prisma = app.get(PrismaService);
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
    respondDelayMs = 0;
    await prisma.job.deleteMany();
    await prisma.form.deleteMany();
  });

  async function createForm(slug: string, actions: any[]) {
    await request(app.getHttpServer())
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: slug, slug, fields: [{ name: 'name', type: 'text', label: 'Name', required: true }], actions })
      .expect(201);
  }

  it('tests never send real email (jest.setup strips SMTP_*)', () => {
    expect(app.get(MailService).isConfigured).toBe(false);
  });

  it('a submission queues its webhook action and the worker delivers it', async () => {
    await createForm('queued-hook', [{ type: 'webhook', url: receiverUrl }]);
    const res = await request(app.getHttpServer()).post('/api/submit/queued-hook').send({ data: { name: 'Ann' } }).expect(201);

    const job = await waitFor(() => prisma.job.findFirst({ where: { type: 'form.webhook', status: 'done' } }));
    expect(job.attempts).toBe(1);
    expect(job.payload).toMatchObject({ submissionId: res.body.submissionId, data: { name: 'Ann' } });
    expect(received).toEqual([{ data: { name: 'Ann' } }]);
  });

  it('the submitter never waits for a slow endpoint', async () => {
    respondDelayMs = 3_000;
    await createForm('slow-hook', [{ type: 'webhook', url: receiverUrl }]);
    const started = Date.now();
    await request(app.getHttpServer()).post('/api/submit/slow-hook').send({ data: { name: 'Ann' } }).expect(201);
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('a failing endpoint is retried with backoff instead of being lost', async () => {
    respondWith = 503;
    await createForm('failing-hook', [{ type: 'webhook', url: receiverUrl }]);
    await request(app.getHttpServer()).post('/api/submit/failing-hook').send({ data: { name: 'Ann' } }).expect(201);

    const job = await waitFor(() => prisma.job.findFirst({ where: { type: 'form.webhook', lastError: { not: null } } }));
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain('HTTP 503');
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
  });

  it('an email action without SMTP configured completes (skipped), not retried', async () => {
    await createForm('mail-form', [{ type: 'email', to: 'owner@example.com', subject: 'New from {{name}}' }]);
    await request(app.getHttpServer()).post('/api/submit/mail-form').send({ data: { name: 'Ann' } }).expect(201);
    const job = await waitFor(() => prisma.job.findFirst({ where: { type: 'form.email', status: 'done' } }));
    expect(job.attempts).toBe(1);
  });

  it('honeypot submissions queue nothing', async () => {
    await createForm('honey', [{ type: 'webhook', url: receiverUrl }]);
    await request(app.getHttpServer()).post('/api/submit/honey').send({ data: { name: 'Bot', _honey: 'x' } });
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.job.count()).toBe(0);
  });

  it('concurrent claims never return the same job twice', async () => {
    const svc = app.get(JobsService);
    // Unknown type: anything the running worker claims is failed, never executed twice.
    await svc.enqueueMany(Array.from({ length: 30 }, (_, i) => ({ type: 'test.noop', payload: { i } })), { delayMs: 3_600_000 });
    await prisma.job.updateMany({ data: { runAt: new Date(Date.now() - 1_000) } });
    const batches = await Promise.all([svc.claimDue(12), svc.claimDue(12), svc.claimDue(12)]);
    const ids = batches.flat().map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
