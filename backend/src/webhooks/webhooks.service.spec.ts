import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';

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
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    update:     jest.fn(),
    count:      jest.fn(),
  },
};

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrisma },
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

  describe('fire()', () => {
    beforeEach(() => {
      mockPrisma.webhook.findMany.mockResolvedValue([mockHook]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 1 });
    });

    it('enqueues delivery for a matching event', async () => {
      service.fire('entry.created', { id: 1 });
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.webhook.findMany).toHaveBeenCalled();
    });

    it('skips delivery for non-matching event', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { ...mockHook, events: ['entry.created'] },
      ]);

      service.fire('media.uploaded', { filename: 'photo.jpg' });
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it('delivers to wildcard (*) hooks for any event', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { ...mockHook, events: ['*'] },
      ]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 2 });

      service.fire('media.deleted', { filename: 'old.jpg' });
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.webhook.findMany).toHaveBeenCalled();
    });

    it('skips disabled hooks (DB filters enabled:true, returns empty)', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      service.fire('entry.created', { id: 1 });
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
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
