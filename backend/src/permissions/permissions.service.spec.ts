import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  permission: {
    findMany:    jest.fn(),
    upsert:      jest.fn(),
    deleteMany:  jest.fn(),
  },
  $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
};

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(PermissionsService);
  });

  // ── can() — admin bypass ────────────────────────────────────────────────────

  describe('can() — admin bypass', () => {
    it('always returns true for admin regardless of action', async () => {
      expect(await service.can('admin', 'blog', 'delete')).toBe(true);
      expect(await service.can('admin', 'blog', 'publish')).toBe(true);
      // Admin shortcircuits before any DB call
      expect(mockPrisma.permission.findMany).not.toHaveBeenCalled();
    });
  });

  // ── can() — specific DB permission ─────────────────────────────────────────

  describe('can() — DB-backed permission', () => {
    it('returns true when DB row explicitly grants the action', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([
        { role: 'editor', contentType: 'blog', actions: ['read', 'create', 'update'] },
      ]);
      expect(await service.can('editor', 'blog', 'create')).toBe(true);
    });

    it('returns false when action is not in DB row', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([
        { role: 'contributor', contentType: 'blog', actions: ['read'] },
      ]);
      expect(await service.can('contributor', 'blog', 'delete')).toBe(false);
    });

    it('falls back to wildcard (*) row when no specific match', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([
        { role: 'editor', contentType: '*', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      ]);
      expect(await service.can('editor', 'news', 'publish')).toBe(true);
    });
  });

  // ── can() — hardcoded defaults ──────────────────────────────────────────────

  describe('can() — hardcoded defaults', () => {
    beforeEach(() => {
      // No DB rows → falls back to hardcoded defaults
      mockPrisma.permission.findMany.mockResolvedValue([]);
    });

    it('viewer can read', async () => {
      expect(await service.can('viewer', 'blog', 'read')).toBe(true);
    });

    it('viewer cannot create', async () => {
      expect(await service.can('viewer', 'blog', 'create')).toBe(false);
    });

    it('contributor can create but not delete', async () => {
      expect(await service.can('contributor', 'blog', 'create')).toBe(true);
      expect(await service.can('contributor', 'blog', 'delete')).toBe(false);
    });

    it('editor can publish', async () => {
      expect(await service.can('editor', 'blog', 'publish')).toBe(true);
    });

    it('unknown role cannot do anything', async () => {
      expect(await service.can('unknown', 'blog', 'read')).toBe(false);
    });
  });

  // ── upsert ──────────────────────────────────────────────────────────────────

  describe('upsert()', () => {
    it('calls prisma upsert with correct args', async () => {
      const row = { id: 1, role: 'editor', contentType: 'blog', actions: ['read', 'create'] };
      mockPrisma.permission.upsert.mockResolvedValue(row);

      const result = await service.upsert('editor', 'blog', ['read', 'create']);

      expect(mockPrisma.permission.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where:  { role_contentType: { role: 'editor', contentType: 'blog' } },
          create: { role: 'editor', contentType: 'blog', actions: ['read', 'create'] },
          update: { actions: ['read', 'create'] },
        }),
      );
      expect(result).toEqual(row);
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('removes the specific override and returns a message', async () => {
      mockPrisma.permission.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.remove('editor', 'blog');
      expect(mockPrisma.permission.deleteMany).toHaveBeenCalledWith(
        { where: { role: 'editor', contentType: 'blog' } },
      );
      expect(result.message).toContain('editor/blog');
    });
  });

  // ── resetAll ────────────────────────────────────────────────────────────────

  describe('resetAll()', () => {
    it('clears all rows and seeds defaults', async () => {
      mockPrisma.permission.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.resetAll();
      expect(mockPrisma.permission.deleteMany).toHaveBeenCalledWith({});
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
      expect(result.message).toContain('reset');
    });
  });
});
