import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntriesService, reorderSlots } from './entries.service';
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
    groupBy:     jest.fn(),
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
    it('group: one row per page, with every language\'s entry attached', async () => {
      (mockPrisma as any).setting = { findUnique: jest.fn().mockResolvedValue({ defaultLocale: 'en' }) };
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: 1 }])  // pages
        .mockResolvedValueOnce([{ id: 10 }]);   // the representative of each page
      mockPrisma.entry.findMany
        .mockResolvedValueOnce([mockEntry])     // the rows
        .mockResolvedValueOnce([                // every language of those pages
          { id: 11, contentTypeId: 1, slug: 'hello-world', locale: 'hi', status: 'draft' },
          { id: 10, contentTypeId: 1, slug: 'hello-world', locale: 'en', status: 'published' },
        ]);

      const result = await service.findAll({ contentTypeId: 1, group: true });

      expect(result.meta.total).toBe(1);
      expect(mockPrisma.entry.count).not.toHaveBeenCalled();
      const row: any = result.data[0];
      expect(row.id).toBe(10);
      expect(row.translations).toEqual(['en', 'hi']);
      expect(row.translationEntries).toEqual([
        { id: 10, locale: 'en', status: 'published' },
        { id: 11, locale: 'hi', status: 'draft' },
      ]);
      // The default language wins the row
      const sql = mockPrisma.$queryRaw.mock.calls[1];
      expect(sql.slice(1)).toContain('en');
    });

    it('group is ignored when a language is picked', async () => {
      mockPrisma.entry.count.mockResolvedValue(1);
      mockPrisma.entry.findMany.mockResolvedValue([mockEntry]);
      await service.findAll({ contentTypeId: 1, group: true, locale: 'en' });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.entry.count).toHaveBeenCalled();
    });

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

    it('a new slug renames every language of the page with it', async () => {
      (mockPrisma.entry as any).findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entryVersion.create.mockResolvedValue({});
      mockPrisma.entry.findMany
        .mockResolvedValueOnce([])  // findOne: translations
        .mockResolvedValueOnce([{ id: 11, slug: 'hello-world', status: 'draft', locale: 'hi' }]);
      mockPrisma.entry.update.mockResolvedValue({ ...mockEntry, slug: 'hello-again' });
      mockPrisma.entry.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(10, { slug: 'hello-again' } as any, 1);

      expect(result.slug).toBe('hello-again');
      expect(mockPrisma.entry.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { contentTypeId: 1, slug: 'hello-world', id: { not: 10 } },
      }));
      expect((mockPrisma.entry as any).findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { contentTypeId: 1, slug: 'hello-again', locale: { in: ['en', 'hi'] } },
      }));
      expect(mockPrisma.entry.updateMany).toHaveBeenCalledWith({ where: { id: { in: [11] } }, data: { slug: 'hello-again' } });
    });

    it('refuses a slug another page already uses in any of its languages', async () => {
      (mockPrisma.entry as any).findFirst = jest.fn().mockResolvedValue({ locale: 'hi' });
      mockPrisma.entry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.entryVersion.create.mockResolvedValue({});
      mockPrisma.entry.findMany
        .mockResolvedValueOnce([])  // findOne: translations
        .mockResolvedValueOnce([{ id: 11, slug: 'hello-world', status: 'draft', locale: 'hi' }]);
      mockPrisma.entry.update.mockClear();
      mockPrisma.entry.updateMany.mockClear();

      await expect(service.update(10, { slug: 'taken' } as any, 1)).rejects.toThrow(/locale "hi"/);
      expect(mockPrisma.entry.update).not.toHaveBeenCalled();
      expect(mockPrisma.entry.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reorderSlots()', () => {
    it('puts the moved items into the places they held, the rest stay put', () => {
      expect(reorderSlots(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b', 'e']);
      expect(reorderSlots(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
      expect(reorderSlots(['a', 'b'], ['x', 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('reorder()', () => {
    beforeEach(() => {
      (mockPrisma as any).$queryRaw = jest.fn();
      (mockPrisma as any).$executeRaw = jest.fn();
    });

    it('renumbers the pages, the moved ones taking each other\'s places', async () => {
      mockPrisma.entry.findMany.mockResolvedValue([{ id: 7, slug: 'contact' }, { id: 3, slug: 'about' }]);
      (mockPrisma as any).$queryRaw.mockResolvedValue([{ slug: 'home' }, { slug: 'about' }, { slug: 'blog' }, { slug: 'contact' }]);
      (mockPrisma as any).$executeRaw.mockResolvedValue(2);
      await expect(service.reorder(1, [7, 3])).resolves.toEqual({ updated: 2 });
      const sql = (mockPrisma as any).$executeRaw.mock.calls[0];
      const values = sql.slice(1).flatMap((v: any) => (v?.values ?? [v]));
      // home 1, contact 2, blog 3, about 4
      expect(values).toEqual(expect.arrayContaining(['home', 1, 'contact', 2, 'blog', 3, 'about', 4]));
      expect(values.indexOf('contact')).toBeLessThan(values.indexOf('about'));
    });

    it('refuses ids from another content type, duplicates or an empty list', async () => {
      mockPrisma.entry.findMany.mockResolvedValue([{ id: 7, slug: 'contact' }]);
      await expect(service.reorder(1, [7, 99])).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reorder(1, [7, 7])).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.reorder(1, [])).rejects.toBeInstanceOf(BadRequestException);
      expect((mockPrisma as any).$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('promote()', () => {
    it('any status other than draft drops a scheduled publish; draft keeps it', async () => {
      const scheduled = { ...mockEntry, status: 'draft', publishAt: new Date(Date.now() + 86_400_000) };
      for (const [target, cleared] of [['staging', true], ['archived', true], ['pending_review', true], ['draft', false]] as const) {
        mockPrisma.entry.findUnique.mockResolvedValue(scheduled);
        mockPrisma.entry.findMany.mockResolvedValue([]);
        mockPrisma.entryVersion.create.mockResolvedValue({});
        mockPrisma.entry.update.mockClear();
        mockPrisma.entry.update.mockResolvedValue({ ...scheduled, status: target });
        await service.promote(10, target as any, 1);
        const data = mockPrisma.entry.update.mock.calls[0][0].data;
        expect(data.status).toBe(target);
        expect('publishAt' in data && data.publishAt === null).toBe(cleared);
      }
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

  describe('getCounts()', () => {
    it('returns grouped totals and pending counts', async () => {
      mockPrisma.entry.groupBy
        .mockResolvedValueOnce([{ contentTypeId: 1, _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ contentTypeId: 1, _count: { _all: 2 } }]);

      const result = await service.getCounts();
      expect(result.totals[1]).toBe(5);
      expect(result.pending[1]).toBe(2);
    });
  });
});
