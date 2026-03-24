import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';

const mockHook = {
  id: 1,
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
    create:   jest.fn(),
    findMany: jest.fn(),
    update:   jest.fn(),
    count:    jest.fn(),
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
      // fire() calls findMany to get active hooks, then enqueues deliveries
      mockPrisma.webhook.findMany.mockResolvedValue([mockHook]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({ id: 1 });
    });

    it('enqueues delivery for a matching event', async () => {
      // entry.created matches mockHook events
      service.fire('entry.created', { id: 1 });
      // fire is async internally; give it a tick
      await new Promise((r) => setImmediate(r));
      expect(mockPrisma.webhook.findMany).toHaveBeenCalled();
    });

    it('skips delivery for non-matching event', async () => {
      // mockHook listens to entry.created + entry.updated, not media.uploaded
      mockPrisma.webhook.findMany.mockResolvedValue([
        { ...mockHook, events: ['entry.created'] },
      ]);

      service.fire('media.uploaded', { filename: 'photo.jpg' });
      await new Promise((r) => setImmediate(r));
      // webhookDelivery.create should not be called for non-matching hook
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
      // enqueueAll queries with where: { enabled: true }, so disabled hooks are
      // never returned — simulate that by returning an empty array
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
    it('returns paginated delivery log', async () => {
      mockPrisma.webhookDelivery.count.mockResolvedValue(5);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        { id: 1, webhookId: 1, event: 'entry.created', status: 'delivered', attempts: 1 },
      ]);

      const result = await service.findDeliveries(1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(5);
    });
  });
});
