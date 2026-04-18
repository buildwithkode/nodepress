import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ContentTypeService } from './content-type.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { SchemaValidator } from '../fields/schema.validator';
import { FormGenerator } from '../fields/form.generator';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockCT = {
  id: 1,
  name: 'blog',
  schema: [{ name: 'title', type: 'text', required: true }],
  allowedMethods: null,
  createdAt: new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  contentType: {
    findUnique:  jest.fn(),
    findFirst:   jest.fn(),
    findMany:    jest.fn(),
    create:      jest.fn(),
    update:      jest.fn(),
    delete:      jest.fn(),
  },
  contentTypeSchemaVersion: { create: jest.fn() },
  entry: { count: jest.fn() },
};

const mockCache = {
  get:              jest.fn().mockResolvedValue(undefined),
  set:              jest.fn(),
  invalidatePrefix: jest.fn(),
};

const mockSchemaValidator = { validate: jest.fn((s) => s) };
const mockFormGenerator   = { generate: jest.fn().mockReturnValue([]) };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ContentTypeService', () => {
  let service: ContentTypeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentTypeService,
        { provide: PrismaService,    useValue: mockPrisma },
        { provide: AppCacheService,  useValue: mockCache },
        { provide: SchemaValidator,  useValue: mockSchemaValidator },
        { provide: FormGenerator,    useValue: mockFormGenerator },
      ],
    }).compile();

    service = module.get<ContentTypeService>(ContentTypeService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a content type with normalized name', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(null);
      mockPrisma.contentType.create.mockResolvedValue(mockCT);

      const result = await service.create({ name: 'Blog Posts', schema: [] } as any);
      // name normalized to snake_case
      expect(mockPrisma.contentType.create.mock.calls[0][0].data.name).toBe('blog_posts');
    });

    it('throws ConflictException for duplicate name', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      await expect(service.create({ name: 'blog', schema: [] } as any)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for reserved name "auth"', async () => {
      await expect(service.create({ name: 'auth', schema: [] } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for reserved name "media"', async () => {
      await expect(service.create({ name: 'media', schema: [] } as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all content types', async () => {
      mockPrisma.contentType.findMany.mockResolvedValue([mockCT]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns content type by id', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      expect(await service.findOne(1)).toEqual(mockCT);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('snapshots schema version before updating', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      mockPrisma.contentType.findFirst.mockResolvedValue(null);
      mockPrisma.contentType.update.mockResolvedValue(mockCT);
      mockPrisma.entry.count.mockResolvedValue(0);

      await service.update(1, { schema: [{ name: 'title', type: 'text' }] } as any, 1);
      expect(mockPrisma.contentTypeSchemaVersion.create).toHaveBeenCalled();
    });

    it('invalidates cache after update', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      mockPrisma.contentType.findFirst.mockResolvedValue(null);
      mockPrisma.contentType.update.mockResolvedValue(mockCT);
      mockPrisma.entry.count.mockResolvedValue(0);

      await service.update(1, { schema: [] } as any, 1);
      expect(mockCache.invalidatePrefix).toHaveBeenCalled();
    });

    it('returns warnings when required field added to type with existing entries', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      mockPrisma.contentType.findFirst.mockResolvedValue(null);
      mockPrisma.contentType.update.mockResolvedValue({ ...mockCT, schema: [{ name: 'new_field', type: 'text', required: true }] });
      mockPrisma.entry.count.mockResolvedValue(5); // 5 existing entries

      // Old schema has 'title'; new schema replaces it with 'new_field' (required).
      // Warnings: (1) "title" removed, (2) "new_field" is new + required.
      const newSchema = [{ name: 'new_field', type: 'text', required: true }];
      const result = await service.update(1, { schema: newSchema } as any, 1) as any;
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      // One warning must mention new_field, another must mention title
      expect(result.warnings.some((w: string) => w.includes('new_field'))).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('title'))).toBe(true);
    });

    it('warns when field removed from type with existing entries', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT); // has 'title' field
      mockPrisma.contentType.findFirst.mockResolvedValue(null);
      mockPrisma.contentType.update.mockResolvedValue({ ...mockCT, schema: [] }); // removed 'title'
      mockPrisma.entry.count.mockResolvedValue(3);

      const result = await service.update(1, { schema: [] } as any, 1) as any;
      expect(result.warnings).toBeDefined();
      expect(result.warnings[0]).toContain('title');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes content type and busts cache', async () => {
      mockPrisma.contentType.findUnique.mockResolvedValue(mockCT);
      mockPrisma.contentType.delete.mockResolvedValue(mockCT);

      await service.remove(1);
      expect(mockPrisma.contentType.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockCache.invalidatePrefix).toHaveBeenCalled();
    });
  });
});
