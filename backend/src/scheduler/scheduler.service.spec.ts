import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  $queryRaw:   jest.fn(),
  entry: {
    findMany:   jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog:     { deleteMany: jest.fn() },
  refreshToken: { deleteMany: jest.fn() },
  job:          { deleteMany: jest.fn() },
};

const mockWebhooks = { fire: jest.fn() };

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
    it('publishes due entries with a conditional update and fires a webhook', async () => {
      const dueEntry = { id: 5, slug: 'scheduled', contentTypeId: 1 };
      mockPrisma.entry.findMany.mockResolvedValueOnce([dueEntry]);
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 1 });

      await service.publishScheduledEntries();

      expect(mockPrisma.entry.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 5, contentTypeId: 1, status: 'draft', deletedAt: null }),
        data: { status: 'published', publishAt: null },
      });
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.updated', expect.objectContaining({ id: 5, scheduledPublish: true }));
    });

    it('does not fire when another instance already published the entry', async () => {
      mockPrisma.entry.findMany.mockResolvedValueOnce([{ id: 5, slug: 'scheduled', contentTypeId: 1 }]);
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 0 });

      await service.publishScheduledEntries();
      expect(mockWebhooks.fire).not.toHaveBeenCalled();
    });

    it('skips publishing when no entries are due', async () => {
      mockPrisma.entry.findMany.mockResolvedValueOnce([]);
      await service.publishScheduledEntries();
      expect(mockPrisma.entry.updateMany).not.toHaveBeenCalled();
    });

    it('never takes an advisory lock', async () => {
      mockPrisma.entry.findMany.mockResolvedValueOnce([]);
      await service.publishScheduledEntries();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  // ── weeklyMaintenance ──────────────────────────────────────────────────────

  describe('weeklyMaintenance()', () => {
    it('prunes old audit logs and expired refresh tokens', async () => {
      mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 10 });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.job.deleteMany.mockResolvedValue({ count: 2 });

      await service.weeklyMaintenance();

      expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.job.deleteMany).toHaveBeenCalledWith({
        where: { OR: [expect.objectContaining({ status: 'done' }), expect.objectContaining({ status: 'failed' })] },
      });
    });
  });
});
