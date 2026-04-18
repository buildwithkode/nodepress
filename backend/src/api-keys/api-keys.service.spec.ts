import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

const mockPrisma = {
  apiKey: {
    create:     jest.fn(),
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    delete:     jest.fn(),
    update:     jest.fn().mockResolvedValue({}),
  },
};

const mockCache = {
  get:               jest.fn().mockResolvedValue(undefined),
  set:               jest.fn().mockResolvedValue(undefined),
  invalidatePrefix:  jest.fn().mockResolvedValue(undefined),
};

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService,    useValue: mockPrisma },
        { provide: AppCacheService,  useValue: mockCache  },
      ],
    }).compile();

    service = module.get(ApiKeysService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('generates a key with "np_" prefix and persists it', async () => {
      const dto = { name: 'My Key', permissions: { access: 'read', contentTypes: ['*'] } };
      mockPrisma.apiKey.create.mockResolvedValue({ id: 1, key: 'np_abc', ...dto });

      const result = await service.create(dto as any);

      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'My Key',
            key: expect.stringMatching(/^np_/),
          }),
        }),
      );
      expect(result.id).toBe(1);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all keys via prisma', async () => {
      const keys = [{ id: 1 }, { id: 2 }];
      mockPrisma.apiKey.findMany.mockResolvedValue(keys);

      const result = await service.findAll();
      expect(result).toEqual(keys);
      expect(mockPrisma.apiKey.findMany).toHaveBeenCalled();
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes the key and invalidates cache', async () => {
      const key = { id: 5, key: 'np_deadbeef' };
      mockPrisma.apiKey.findFirst.mockResolvedValue(key);
      mockPrisma.apiKey.delete.mockResolvedValue(key);

      await service.remove(5);

      expect(mockCache.invalidatePrefix).toHaveBeenCalledWith(`apikey:${key.key}`);
      expect(mockPrisma.apiKey.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('throws NotFoundException when key does not exist', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── validate ────────────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('returns cached value on cache hit', async () => {
      const cached = { id: 1, key: 'np_cached' };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.validate('np_cached');

      expect(result).toEqual(cached);
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('caches null and returns null for unknown key', async () => {
      mockCache.get.mockResolvedValue(undefined);
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      const result = await service.validate('np_unknown');

      expect(result).toBeNull();
      expect(mockCache.set).toHaveBeenCalledWith('apikey:np_unknown', null, expect.any(Number));
    });

    it('caches and returns a valid key from DB', async () => {
      const dbKey = { id: 3, key: 'np_valid', permissions: {} };
      mockCache.get.mockResolvedValue(undefined);
      mockPrisma.apiKey.findUnique.mockResolvedValue(dbKey);

      const result = await service.validate('np_valid');

      expect(result).toEqual(dbKey);
      expect(mockCache.set).toHaveBeenCalledWith('apikey:np_valid', dbKey, expect.any(Number));
    });
  });
});
