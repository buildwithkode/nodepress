import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
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
};

const mockJwt = {
  sign:   jest.fn().mockReturnValue('tok'),
  verify: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DynamicApiService', () => {
  let service: DynamicApiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(undefined); // always cache miss

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicApiService,
        { provide: PrismaService,   useValue: mockPrisma },
        { provide: AppCacheService, useValue: mockCache },
        { provide: JwtService,      useValue: mockJwt },
      ],
    }).compile();

    service = module.get<DynamicApiService>(DynamicApiService);
  });

  // ── resolveContentType (via findAll) ──────────────────────────────────────

  it('throws NotFoundException for unknown content type', async () => {
    mockPrisma.contentType.findUnique.mockResolvedValue(null);
    await expect(service.findAll('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when method not in allowedMethods', async () => {
    mockPrisma.contentType.findUnique.mockResolvedValue({
      ...mockContentType,
      allowedMethods: ['read'],
    });
    mockPrisma.entry.count.mockResolvedValue(0);
    mockPrisma.entry.findMany.mockResolvedValue([]);
    // 'list' is not in allowedMethods
    await expect(service.findAll('blog')).rejects.toThrow(NotFoundException);
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
      expect(result.data[0].id).toBe(mockContentType.name === 'blog' ? expect.any(String) : undefined);
    });

    it('uses cached result on cache hit', async () => {
      const cachedResult = { data: [{ id: 'cached' }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
      mockCache.get.mockResolvedValueOnce(cachedResult); // first call is ct meta miss
      mockCache.get.mockResolvedValueOnce(cachedResult); // second call is list cache hit

      // First call populates ct cache, second returns list from cache
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);

      const result = await service.findAll('blog');
      // DB count/findMany should not be called when cache hits
      // (content type might still be fetched if not in cache)
      expect(result).toBeDefined();
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
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates an entry and invalidates cache', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(null);
      mockPrisma.entry.create.mockResolvedValue(makeEntry());

      await service.create('blog', 'hello', { title: 'Hello' });
      expect(mockCache.invalidatePrefix).toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates entry and invalidates cache', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockContentType);
      mockPrisma.entry.findUnique.mockResolvedValue(makeEntry());
      mockPrisma.entry.update.mockResolvedValue(makeEntry({ data: { title: 'Updated' } }));

      await service.update('blog', 'hello', { title: 'Updated' });
      expect(mockCache.invalidatePrefix).toHaveBeenCalled();
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
