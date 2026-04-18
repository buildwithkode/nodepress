import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntriesService } from './entries.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataValidator } from '../fields/data.validator';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockContentType = {
  id: 1,
  name: 'blog',
  schema: [{ name: 'title', type: 'text', required: true }],
  allowedMethods: null,
  createdAt: new Date(),
};

const mockEntry = {
  id: 10,
  publicId: 'aaaaaaaa-0000-4000-8000-000000000001',
  slug: 'hello-world',
  locale: 'en',
  status: 'published',
  deletedAt: null,
  data: { title: 'Hello World' },
  seo: null,
  publishAt: null,
  contentTypeId: 1,
  contentType: mockContentType,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  contentType: { findUnique: jest.fn() },
  entry: {
    findUnique:  jest.fn(),
    findMany:    jest.fn(),
    count:       jest.fn(),
    create:      jest.fn(),
    update:      jest.fn(),
    updateMany:  jest.fn(),
    delete:      jest.fn(),
  },
  entryVersion: {
    create:      jest.fn(),
    findMany:    jest.fn(),
    findUnique:  jest.fn(),
  },
  $queryRaw:   jest.fn(),
  $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
};

const mockDataValidator = { validate: jest.fn() };
const mockWebhooks      = { fire: jest.fn() };
const mockRealtime      = {
  notifyEntryCreated: jest.fn(),
  notifyEntryUpdated: jest.fn(),
  notifyEntryDeleted: jest.fn(),
};
const mockJwt           = { sign: jest.fn().mockReturnValue('preview.jwt.token'), verify: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('EntriesService', () => {
  let service: EntriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntriesService,
        { provide: PrismaService,    useValue: mockPrisma },
        { provide: DataValidator,    useValue: mockDataValidator },
        { provide: WebhooksService,  useValue: mockWebhooks },
        { provide: RealtimeGateway,  useValue: mockRealtime },
        { provide: JwtService,       useValue: mockJwt },
      ],
    }).compile();

    service = module.get<EntriesService>(EntriesService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates an entry and fires webhook', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      mockPrisma.entry.create.mockResolvedValue(mockEntry);

      const result = await service.create(
        { contentTypeId: 1, slug: 'hello-world', data: { title: 'Hello World' } } as any,
        1,
      );

      expect(result).toMatchObject({ slug: 'hello-world' });
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.created', expect.any(Object));
      expect(mockRealtime.notifyEntryCreated).toHaveBeenCalled();
    });

    it('throws BadRequestException for unknown content type', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ contentTypeId: 99, slug: 'x', data: {} } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException for duplicate slug+locale', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry); // already exists
      await expect(
        service.create({ contentTypeId: 1, slug: 'hello-world', data: {} } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated result', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.entry.count.mockResolvedValue(1);
      mockPrisma.entry.findMany.mockResolvedValue([mockEntry]);

      const result = await service.findAll({ contentTypeId: 1 });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('enforces max limit of 100', async () => {
      mockPrisma.entry.count.mockResolvedValue(0);
      mockPrisma.entry.findMany.mockResolvedValue([]);

      await service.findAll({ limit: 999 });

      const callArgs = mockPrisma.entry.findMany.mock.calls[0][0];
      expect(callArgs.take).toBeLessThanOrEqual(100);
    });

    it('returns empty result set when search yields no ids', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]); // no FTS matches
      mockPrisma.entry.count.mockResolvedValue(0);
      mockPrisma.entry.findMany.mockResolvedValue([]);

      const result = await service.findAll({ search: 'nonexistent' });
      expect(result.meta.total).toBe(0);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns entry by id', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      const result = await service.findOne(10);
      expect(result.id).toBe(10);
    });

    it('throws NotFoundException for missing entry', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for soft-deleted entry', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue({ ...mockEntry, deletedAt: new Date() });
      await expect(service.findOne(10)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('snapshots a version before saving', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entryVersion.create.mockResolvedValue({});
      mockPrisma.entry.update.mockResolvedValue({ ...mockEntry, data: { title: 'New Title' } });

      await service.update(10, { data: { title: 'New Title' } } as any, 1);

      expect(mockPrisma.entryVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entryId: 10 }) }),
      );
    });

    it('fires entry.updated webhook', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entryVersion.create.mockResolvedValue({});
      mockPrisma.entry.update.mockResolvedValue(mockEntry);

      await service.update(10, { status: 'draft' } as any, 1);
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.updated', expect.any(Object));
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('soft-deletes an entry', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entry.update.mockResolvedValue({ ...mockEntry, deletedAt: new Date() });

      const result = await service.remove(10);
      expect(result.message).toContain('trash');
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.deleted', expect.any(Object));
    });
  });

  // ── restore ───────────────────────────────────────────────────────────────

  describe('restore()', () => {
    it('clears deletedAt', async () => {
      const deleted = { ...mockEntry, deletedAt: new Date() };
      mockPrisma.entry.findUnique.mockResolvedValue(deleted);
      mockPrisma.entry.update.mockResolvedValue(mockEntry);

      const result = await service.restore(10);
      expect(mockPrisma.entry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: null } }),
      );
      expect(result).toMatchObject({ deletedAt: null });
    });

    it('throws NotFoundException when entry is not deleted', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry); // deletedAt is null
      await expect(service.restore(10)).rejects.toThrow(NotFoundException);
    });
  });

  // ── bulk operations ───────────────────────────────────────────────────────

  describe('bulk operations', () => {
    it('bulkDelete updates multiple entries', async () => {
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.bulkDelete([1, 2, 3]);
      expect(result.affected).toBe(3);
    });

    it('bulkPublish sets status to published', async () => {
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 2 });
      const result = await service.bulkPublish([1, 2]);
      expect(result.affected).toBe(2);
      expect(mockPrisma.entry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'published' } }),
      );
    });

    it('bulkSetPendingReview sets status to pending_review', async () => {
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 4 });
      const result = await service.bulkSetPendingReview([1, 2, 3, 4]);
      expect(result.affected).toBe(4);
      expect(mockPrisma.entry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'pending_review' } }),
      );
    });
  });

  // ── version history ───────────────────────────────────────────────────────

  describe('listVersions()', () => {
    it('returns version list', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entryVersion.findMany.mockResolvedValue([{ id: 1, entryId: 10 }]);
      const result = await service.listVersions(10);
      expect(result).toHaveLength(1);
    });
  });

  // ── preview token ─────────────────────────────────────────────────────────

  describe('generatePreviewToken()', () => {
    it('returns token and expiresAt', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      const result = await service.generatePreviewToken(10);
      expect(result.token).toBe('preview.jwt.token');
      expect(result.expiresAt).toBeDefined();
    });

    it('throws NotFoundException for missing entry', async () => {
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      await expect(service.generatePreviewToken(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── export / import ───────────────────────────────────────────────────────

  describe('exportEntries()', () => {
    it('returns all non-deleted entries', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findMany.mockResolvedValue([mockEntry]);
      const result = await service.exportEntries(1);
      expect(result).toHaveLength(1);
    });

    it('throws BadRequestException for unknown content type', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(null);
      await expect(service.exportEntries(99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('importEntries()', () => {
    it('creates new entries that do not exist', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      mockPrisma.entry.create.mockResolvedValue(mockEntry);

      const result = await service.importEntries(1, [
        { slug: 'new-post', data: { title: 'New' } },
      ]);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('updates existing entries', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entry.update.mockResolvedValue(mockEntry);

      const result = await service.importEntries(1, [
        { slug: 'hello-world', data: { title: 'Updated' } },
      ]);
      expect(result.updated).toBe(1);
    });

    it('records error for rows missing slug', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      const result = await service.importEntries(1, [{ slug: '', data: {} }]);
      expect(result.errors).toHaveLength(1);
    });
  });
});
