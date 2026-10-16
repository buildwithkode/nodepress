import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

const mockHook = {
  id: 1,
  name: 'Test Webhook',
  url: 'https://example.com/hook',
  events: ['entry.created', 'entry.updated'],
  secret: 'mysecret',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  webhook: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
    count:      jest.fn(),
  },
  webhookDelivery: {
    create:     jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    update:     jest.fn(),
    count:      jest.fn(),
  },
  $queryRaw:   jest.fn(),
  $executeRaw: jest.fn(),
};

const mockCache = {
  get: jest.fn().mockResolvedValue(undefined), // always a miss: hooks come from the DB
  set: jest.fn(),
  del: jest.fn(),
};

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  // ── CRUD ───────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated webhooks', async () => {
      mockPrisma.webhook.count.mockResolvedValue(1);
      mockPrisma.webhook.findMany.mockResolvedValue([mockHook]);

      const result = await service.findAll();
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne()', () => {
    it('returns a webhook by id', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes a webhook', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      mockPrisma.webhook.delete.mockResolvedValue(mockHook);
      const result = await service.remove(1);
      expect(result.message).toContain('deleted');
    });
  });

  describe('update()', () => {
    it('updates an existing webhook', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      mockPrisma.webhook.update.mockResolvedValue({ ...mockHook, name: 'Renamed' });

      const result = await service.update(1, { name: 'Renamed' });
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: 'Renamed' } });
      expect(result.name).toBe('Renamed');
    });

    it('throws NotFoundException for unknown id', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── toggle ─────────────────────────────────────────────────────────────────

  describe('toggle()', () => {
    it('sets enabled to false', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      mockPrisma.webhook.update.mockResolvedValue({ ...mockHook, enabled: false });

      const result = await service.toggle(1, false);
      expect(result.enabled).toBe(false);
    });

    it('sets enabled to true', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({ ...mockHook, enabled: false });
      mockPrisma.webhook.update.mockResolvedValue({ ...mockHook, enabled: true });

      const result = await service.toggle(1, true);
      expect(result.enabled).toBe(true);
    });
  });

  // ── fire — event matching ──────────────────────────────────────────────────

  describe('enqueue()', () => {
    beforeEach(() => {
      mockPrisma.webhook.findMany.mockResolvedValue([mockHook]);
      mockPrisma.webhookDelivery.createMany.mockImplementation(async ({ data }: any) => ({ count: data.length }));
    });

    it('queues one pending delivery per matching hook and wakes the worker', async () => {
      const wake = jest.fn();
      service.onEnqueue(wake);
      expect(await service.enqueue('entry.created', { id: 1 })).toBe(1);
      expect(mockPrisma.webhookDelivery.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ webhookId: 1, event: 'entry.created', status: 'pending', attempts: 0 })],
      });
      expect(wake).toHaveBeenCalled();
    });

    it('does not send anything inline — the worker does', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn();
      await service.enqueue('entry.created', { id: 1 });
      expect(global.fetch).not.toHaveBeenCalled();
      global.fetch = originalFetch;
    });

    it('skips non-matching events', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([{ ...mockHook, events: ['entry.created'] }]);
      expect(await service.enqueue('media.uploaded', { filename: 'photo.jpg' })).toBe(0);
      expect(mockPrisma.webhookDelivery.createMany).not.toHaveBeenCalled();
    });

    it('matches wildcard (*) hooks for any event', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([{ ...mockHook, events: ['*'] }]);
      expect(await service.enqueue('media.deleted', { filename: 'old.jpg' })).toBe(1);
    });

    it('uses the cached hook list when present', async () => {
      mockCache.get.mockResolvedValueOnce([mockHook]);
      await service.enqueue('entry.created', { id: 1 });
      expect(mockPrisma.webhook.findMany).not.toHaveBeenCalled();
    });

    it('fire() never throws, even when queueing fails', async () => {
      mockPrisma.webhook.findMany.mockRejectedValue(new Error('db down'));
      expect(() => service.fire('entry.created', { id: 1 })).not.toThrow();
      await new Promise((r) => setImmediate(r));
    });
  });

  it('clears the cached hook list when a webhook changes', async () => {
    mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
    mockPrisma.webhook.update.mockResolvedValue({ ...mockHook, enabled: false });
    await service.toggle(1, false);
    expect(mockCache.del).toHaveBeenCalledWith('webhooks:enabled');
  });

  // ── deliver (worker) ───────────────────────────────────────────────────────

  describe('deliver()', () => {
    const claimed = { id: 7, webhookId: 1, event: 'entry.created', payload: { id: 1 }, attempts: 1, createdAt: new Date() };
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockPrisma.webhook.findMany.mockResolvedValue([mockHook]);
    });
    afterEach(() => { global.fetch = originalFetch; });

    it('marks a successful delivery as delivered, signed with the hook secret', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);
      await service.deliver(claimed);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const expected = 'sha256=' + createHmac('sha256', 'mysecret').update(init.body).digest('hex');
      expect(init.headers['X-NodePress-Signature']).toBe(expected);
      expect(init.headers['X-NodePress-Attempt']).toBe('1');
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'delivered', responseStatus: 200, nextRetryAt: null }),
      });
    });

    it('reschedules a failed attempt with backoff', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as any);
      const before = Date.now();
      await service.deliver(claimed);

      const { data } = mockPrisma.webhookDelivery.update.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'pending', attempts: 1, errorMessage: 'HTTP 503', responseStatus: 503 });
      expect(data.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000);
    });

    it('fails permanently after the last attempt', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await service.deliver({ ...claimed, attempts: 3 });
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'failed', attempts: 3, errorMessage: 'ECONNREFUSED', nextRetryAt: null }),
      });
    });

    it('fails the delivery when its webhook was disabled or deleted', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);
      global.fetch = jest.fn();
      await service.deliver(claimed);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'failed', errorMessage: 'Webhook disabled or deleted' }),
      });
    });

    it('never throws when recording the outcome fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);
      mockPrisma.webhookDelivery.update.mockRejectedValueOnce(new Error('db down'));
      await expect(service.deliver(claimed)).resolves.toBeUndefined();
    });
  });

  // ── HMAC signing ───────────────────────────────────────────────────────────

  describe('HMAC signature', () => {
    it('produces consistent sha256 signature for a known payload', () => {
      const secret  = 'testsecret';
      const payload = JSON.stringify({ event: 'entry.created', data: { id: 1 } });
      const sig1    = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
      const sig2    = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('produces different signatures for different secrets', () => {
      const payload = JSON.stringify({ event: 'entry.created' });
      const sig1 = createHmac('sha256', 'secret1').update(payload).digest('hex');
      const sig2 = createHmac('sha256', 'secret2').update(payload).digest('hex');
      expect(sig1).not.toBe(sig2);
    });
  });

  // ── findDeliveries ─────────────────────────────────────────────────────────

  describe('findDeliveries()', () => {
    it('returns paginated delivery log enriched with webhook details', async () => {
      mockPrisma.webhookDelivery.count.mockResolvedValue(5);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        { id: 1, webhookId: 1, event: 'entry.created', status: 'delivered', attempts: 1 },
      ]);
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 1, name: 'Test Webhook', url: 'https://example.com/hook', enabled: true },
      ]);

      const result = await service.findDeliveries(1, 'delivered', 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].webhook.name).toBe('Test Webhook');
      expect(result.meta.total).toBe(5);
    });
  });

  // ── 1-Click Re-Delivery ─────────────────────────────────────────────────────

  describe('redeliver()', () => {
    const mockDelivery = {
      id: 42,
      webhookId: 1,
      event: 'entry.created',
      payload: { id: 100, title: 'Hello World' },
      status: 'failed',
      attempts: 3,
      responseStatus: 500,
    };

    it('throws NotFoundException when delivery does not exist', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);
      await expect(service.redeliver(999)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when associated webhook is missing', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.redeliver(42)).rejects.toThrow(NotFoundException);
    });

    it('re-delivers successfully and updates status to delivered', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const result = await service.redeliver(42);

      expect(global.fetch).toHaveBeenCalledWith(
        mockHook.url,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-NodePress-Event': 'entry.created',
            'X-NodePress-Redelivery': 'true',
          }),
        }),
      );

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: {
          status: 'delivered',
          attempts: 4,
          responseStatus: 200,
          errorMessage: null,
          nextRetryAt: null,
        },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);

      global.fetch = originalFetch;
    });

    it('handles remote server failure on re-delivery', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrisma.webhook.findUnique.mockResolvedValue(mockHook);
      mockPrisma.webhookDelivery.update.mockResolvedValue({});

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
      } as any);

      const result = await service.redeliver(42);

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: {
          status: 'failed',
          attempts: 4,
          responseStatus: 502,
          errorMessage: 'HTTP 502',
          nextRetryAt: null,
        },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(502);

      global.fetch = originalFetch;
    });
  });
});
