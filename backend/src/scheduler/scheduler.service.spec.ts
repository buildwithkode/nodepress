import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  // $queryRaw is called for both lock acquire AND unlock + for finding due entries
  $queryRaw:   jest.fn(),
  entry: {
    findMany:   jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog:     { deleteMany: jest.fn() },
  refreshToken: { deleteMany: jest.fn() },
  webhookDelivery: { findMany: jest.fn() },
};

const mockWebhooks = { fire: jest.fn(), retryDeliveries: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SchedulerService', () => {
  let service: SchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService,   useValue: mockPrisma },
        { provide: WebhooksService, useValue: mockWebhooks },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  // ── publishScheduledEntries ────────────────────────────────────────────────

  describe('publishScheduledEntries()', () => {
    it('does nothing when advisory lock is not acquired', async () => {
      // pg_try_advisory_lock returns false → lock not acquired
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ acquired: false }]);

      await (service as any).publishScheduledEntries();

      expect(mockPrisma.entry.findMany).not.toHaveBeenCalled();
    });

    it('publishes entries when lock acquired and entries due', async () => {
      // First $queryRaw = lock acquire, second = lock release
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{}]); // unlock

      const dueEntry = { id: 5, slug: 'scheduled', contentTypeId: 1 };
      mockPrisma.entry.findMany.mockResolvedValueOnce([dueEntry]);
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 1 });

      await (service as any).publishScheduledEntries();

      expect(mockPrisma.entry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'published', publishAt: null } }),
      );
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.updated', expect.any(Object));
    });

    it('skips publishing when no entries are due', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{}]); // unlock
      mockPrisma.entry.findMany.mockResolvedValueOnce([]);

      await (service as any).publishScheduledEntries();
      expect(mockPrisma.entry.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── weeklyMaintenance ──────────────────────────────────────────────────────

  describe('weeklyMaintenance()', () => {
    it('prunes old audit logs and expired refresh tokens', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([{}]); // unlock
      mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 10 });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      await (service as any).weeklyMaintenance();

      expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('skips when advisory lock not acquired', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ acquired: false }]);
      await (service as any).weeklyMaintenance();
      expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
    });
  });
});
