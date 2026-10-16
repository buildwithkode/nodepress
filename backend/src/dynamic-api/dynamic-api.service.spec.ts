import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { JwtService } from '@nestjs/jwt';
import { DynamicApiService } from './dynamic-api.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockContentType = {
  id: 1,
  name: 'blog',
  schema: [{ name: 'title', type: 'text' }],
  allowedMethods: null,
};

const makeEntry = (overrides = {}) => ({
  id: 1,
  publicId: 'aaaaaaaa-0000-4000-8000-000000000001',
  slug: 'hello',
  locale: 'en',
  status: 'published',
  deletedAt: null,
  data: { title: 'Hello' },
  createdAt: new Date(),
  updatedAt: new Date(),
  contentTypeId: 1,
  ...overrides,
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  contentType: { findUnique: jest.fn() },
  entry: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  $queryRaw:    jest.fn(),
  $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
};

const mockCache = {
  get:               jest.fn().mockResolvedValue(undefined), // cache miss by default
  set:               jest.fn(),
  invalidatePrefix:  jest.fn(),
  increment:         jest.fn(),
  // Delegates to get() so a test's get() mock also drives the batched reads.
  getMany:           jest.fn((keys: string[]) => Promise.all(keys.map((k) => mockCache.get(k)))),
};

const mockJwt = {
  sign:   jest.fn().mockReturnValue('tok'),
  verify: jest.fn(),
};

const mockWebhooks = { fire: jest.fn() };
const mockRealtime = {
  notifyEntryCreated: jest.fn(),
  notifyEntryUpdated: jest.fn(),
  notifyEntryDeleted: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DynamicApiService', () => {
  let service: DynamicApiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks only clears call history — it does NOT drain a queued
    // mockResolvedValueOnce or a mockImplementation, which would otherwise leak
    // into the next test's cache lookups. mockReset clears those.
    mockCache.get.mockReset();
    mockCache.get.mockResolvedValue(undefined); // always cache miss

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicApiService,
        { provide: PrismaService,   useValue: mockPrisma },
        { provide: AppCacheService, useValue: mockCache },
        { provide: JwtService,      useValue: mockJwt },
        { provide: WebhooksService, useValue: mockWebhooks },
        { provide: RealtimeGateway, useValue: mockRealtime },
      ],
    }).compile();

    service = module.get<DynamicApiService>(DynamicApiService);
  });

  // ── resolveContentType (via findAll) ──────────────────────────────────────

  it('throws NotFoundException for unknown content type', async () => {
    mockPrisma.contentType.findUnique.mockResolvedValue(null);
    await expect(service.findAll('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when method not in allowedMethods', async () => {
    mockPrisma.contentType.findUnique.mockResolvedValue({
      ...mockContentType,
      allowedMethods: ['read'],
    });
    // findAll resolves the content type with method 'list'; it's not allowed here.
    await expect(service.findAll('blog')).rejects.toThrow(ForbiddenException);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    beforeEach(() => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.count.mockResolvedValue(1);
      mockPrisma.entry.findMany.mockResolvedValue([makeEntry()]);
    });

    it('returns paginated result', async () => {
      const result = await service.findAll('blog');
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      // id is the publicId UUID — an asymmetric matcher must use toEqual, not toBe.
      expect(result.data[0].id).toEqual(expect.any(String));
    });

    it('uses cached result on cache hit', async () => {
      const cachedResult = { data: [{ id: 'cached' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
      // resolveContentType reads the content-type cache (key "ct:meta:…") first;
      // findAll then reads the list cache (key "dyn:…:list:…"). Serve each its
      // own shape so the list hit short-circuits the DB.
      mockCache.get.mockImplementation(async (key: string) =>
        key.includes(':list:') ? cachedResult : mockContentType,
      );

      const result = await service.findAll('blog');

      expect(result).toEqual(cachedResult);
      // On a list cache hit the DB is not queried for entries.
      expect(mockPrisma.entry.findMany).not.toHaveBeenCalled();
    });

    it('respects pagination limits — max 100', async () => {
      await service.findAll('blog', { limit: 9999 });
      expect(mockPrisma.entry.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
    });

    it('applies field projection when fields param provided', async () => {
      const result = await service.findAll('blog', { fields: ['title'] });
      // data.title should be present, no other data keys
      const entry = result.data[0];
      expect(entry.data).toEqual({ title: 'Hello' });
    });

    it('does not cache projected responses', async () => {
      await service.findAll('blog', { fields: ['title'] });
      // cache.set should only be called for the ct meta, not the result
      const listCacheCalls = mockCache.set.mock.calls.filter(([k]) => k.startsWith('dyn:'));
      expect(listCacheCalls).toHaveLength(0);
    });

    it('falls back to LIKE search when FTS throws', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.$queryRaw
        .mockRejectedValueOnce(new Error('tsquery syntax error')) // FTS fails
        .mockResolvedValueOnce([{ id: 1 }]);                     // LIKE fallback succeeds
      mockPrisma.entry.count.mockResolvedValue(1);
      mockPrisma.entry.findMany.mockResolvedValue([makeEntry()]);

      const result = await service.findAll('blog', { search: 'hello' });
      expect(result.meta.searchMode).toBe('fallback');
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns a published entry', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      const result = await service.findOne('blog', 'hello');
      expect(result.slug).toBe('hello');
    });

    it('throws NotFoundException for draft entry', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry({ status: 'draft' }));
      await expect(service.findOne('blog', 'hello')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for soft-deleted entry', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry({ deletedAt: new Date() }));
      await expect(service.findOne('blog', 'hello')).rejects.toThrow(NotFoundException);
    });

    it('exposes the seo object in the public response (regression)', async () => {
      const seo = { title: 'Custom', description: 'Desc', image: 'https://x/og.jpg', noIndex: true };
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry({ seo }));
      const result = await service.findOne('blog', 'hello');
      expect(result.seo).toEqual(seo);
    });

    it('still strips internal fields (status, deletedAt) from the public response', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry({ seo: { title: 'x' } }));
      const result = await service.findOne('blog', 'hello');
      expect(result.status).toBeUndefined();
      expect(result.deletedAt).toBeUndefined();
    });
  });

  // ── read replica ───────────────────────────────────────────────────────────

  describe('read replica routing', () => {
    const replica = { entry: { findUnique: jest.fn() } };

    afterEach(() => { delete (mockPrisma as any).readReplica; });

    it('serves public reads from the replica when one is configured', async () => {
      (mockPrisma as any).readReplica = replica;
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      replica.entry.findUnique.mockResolvedValue(makeEntry());
      mockPrisma.entry.findUnique.mockClear();

      const result = await service.findOne('blog', 'hello');
      expect(result.slug).toBe('hello');
      expect(replica.entry.findUnique).toHaveBeenCalled();
      expect(mockPrisma.entry.findUnique).not.toHaveBeenCalled();
    });

    it('reads the primary right after a write so the replica cannot re-cache stale data', async () => {
      (mockPrisma as any).readReplica = replica;
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      replica.entry.findUnique.mockClear();
      mockCache.get.mockImplementation(async (key: string) => (key === 'replica:recent-write' ? 1 : undefined));

      await service.findOne('blog', 'hello');
      expect(mockPrisma.entry.findUnique).toHaveBeenCalled();
      expect(replica.entry.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── cache invalidation (Prisma middleware) ─────────────────────────────────

  describe('invalidatingWrite()', () => {
    const bumped = () => mockCache.increment.mock.calls.map(([key]) => key);
    const write = (params: any, result: any = {}) => service.invalidatingWrite(params, async () => result);

    it('bumps only the written content type', async () => {
      await write({ model: 'Entry', action: 'create', args: { data: { contentTypeId: 7 } } });
      expect(bumped()).toEqual(['dyn:generation:7']);
      expect(mockCache.set).toHaveBeenCalledWith('replica:recent-write:7', 1, expect.any(Number));
    });

    it('takes the content type from the returned row', async () => {
      await write({ model: 'Entry', action: 'update', args: { where: { id: 3 }, data: { status: 'published' } } }, { id: 3, contentTypeId: 4 });
      expect(bumped()).toEqual(['dyn:generation:4']);
      expect(mockPrisma.entry.findMany).not.toHaveBeenCalled();
    });

    it('looks up the content types of a bulk update by entry id', async () => {
      mockPrisma.entry.findMany.mockResolvedValue([{ contentTypeId: 2 }, { contentTypeId: 5 }]);
      await write({ model: 'Entry', action: 'updateMany', args: { where: { id: { in: [1, 2, 3] } }, data: { status: 'archived' } } }, { count: 3 });
      expect(bumped()).toEqual(['dyn:generation:2', 'dyn:generation:5']);
    });

    it('looks up a hard delete before the rows are gone', async () => {
      const order: string[] = [];
      mockPrisma.entry.findMany.mockImplementation(async () => { order.push('lookup'); return [{ contentTypeId: 9 }]; });
      await service.invalidatingWrite({ model: 'Entry', action: 'delete', args: { where: { id: 1 } } }, async () => { order.push('delete'); return {}; });
      expect(order).toEqual(['lookup', 'delete']);
      expect(bumped()).toEqual(['dyn:generation:9']);
    });

    it('skips invalidation when a bulk write matched nothing', async () => {
      await write({ model: 'Entry', action: 'updateMany', args: { where: { status: 'draft' }, data: {} } }, { count: 0 });
      expect(mockCache.increment).not.toHaveBeenCalled();
    });

    it('falls back to the global generation when the content type is unknown', async () => {
      await write({ model: 'Entry', action: 'updateMany', args: { where: { status: 'draft' }, data: { status: 'published' } } }, { count: 2 });
      expect(bumped()).toEqual(['dyn:generation']);
    });

    it('ignores writes to other models', async () => {
      await write({ model: 'User', action: 'update', args: { where: { id: 1 }, data: {} } });
      expect(mockCache.increment).not.toHaveBeenCalled();
    });

    it('keys public reads by the content type generation', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      mockCache.get.mockImplementation(async (key: string) =>
        ({ 'dyn:generation': 2, 'dyn:generation:1': 5 } as Record<string, number>)[key]);

      await service.findOne('blog', 'hello');
      expect(mockCache.set).toHaveBeenCalledWith('dyn:2.5:1:slug:hello:en:published', expect.anything(), expect.any(Number));
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates an entry', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      mockPrisma.entry.create.mockResolvedValue(makeEntry());

      const result = await service.create('blog', 'hello', { title: 'Hello' });
      expect(result.slug).toBe('hello');
    });

    it('fires the entry.created webhook and realtime event like an admin create', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      mockPrisma.entry.create.mockResolvedValue(makeEntry());

      await service.create('blog', 'hello', { title: 'Hello' });
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.created', expect.objectContaining({ slug: 'hello', contentType: 'blog' }));
      expect(mockRealtime.notifyEntryCreated).toHaveBeenCalledWith(expect.objectContaining({ slug: 'hello', contentType: 'blog' }));
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates entry and fires side effects', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      mockPrisma.entry.update.mockResolvedValue(makeEntry({ data: { title: 'Updated' } }));

      await service.update('blog', 'hello', { title: 'Updated' });
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.updated', expect.objectContaining({ contentType: 'blog' }));
      expect(mockRealtime.notifyEntryUpdated).toHaveBeenCalled();
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('soft-deletes entry', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      mockPrisma.entry.update.mockResolvedValue({});

      const result = await service.remove('blog', 'hello');
      expect(result.message).toContain('hello');
      expect(mockWebhooks.fire).toHaveBeenCalledWith('entry.deleted', expect.objectContaining({ slug: 'hello' }));
      expect(mockRealtime.notifyEntryDeleted).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'blog' }));
    });
  });

  // ── preview ────────────────────────────────────────────────────────────────

  describe('findOnePreview()', () => {
    it('returns draft entry with valid token', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'preview', entryId: 1, publicId: 'aaa' });
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry({ status: 'draft' }));

      const result = await service.findOnePreview('blog', 'hello', 'valid.token');
      expect(result._preview).toBe(true);
      expect(result.status).toBe('draft');
    });

    it('throws UnauthorizedException for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });
      await expect(service.findOnePreview('blog', 'hello', 'bad.token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for token with wrong sub', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'access', entryId: 1 });
      await expect(service.findOnePreview('blog', 'hello', 'wrong.token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
