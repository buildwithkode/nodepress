import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';

const mockPrisma = {
  permission: {
    findMany:    jest.fn(),
    upsert:      jest.fn(),
    deleteMany:  jest.fn(),
    createMany:  jest.fn(),
  },
  role: {
    findMany:    jest.fn().mockResolvedValue([]),
  },
  roleAccess: {
    deleteMany:  jest.fn(),
  },
  $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
};

// Custom roles known to the mock: reviewer → contributor, auditor → viewer.
const CUSTOM: Record<string, string> = { reviewer: 'contributor', auditor: 'viewer' };
const mockRoles = {
  resolve: jest.fn(async (name: string) =>
    ['admin', 'editor', 'contributor', 'viewer'].includes(name)
      ? { role: name }
      : { role: CUSTOM[name] ?? 'viewer', customRole: name }),
  exists: jest.fn(async (name: string) =>
    ['admin', 'editor', 'contributor', 'viewer'].includes(name) || name in CUSTOM),
};

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RolesService, useValue: mockRoles },
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

    it('a role that no longer exists falls back to viewer', async () => {
      expect(await service.can('unknown', 'blog', 'read')).toBe(true);
      expect(await service.can('unknown', 'blog', 'create')).toBe(false);
    });
  });

  // ── can() — custom roles ────────────────────────────────────────────────────

  describe('can() — custom roles', () => {
    it('uses the custom role\'s own rows when present', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { role: 'reviewer', contentType: 'blog', actions: ['read', 'update'] },
      ]);
      expect(await service.can('reviewer', 'blog', 'update')).toBe(true);
      expect(mockRoles.resolve).not.toHaveBeenCalled();
    });

    it('an empty row denies even though the base role would allow', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { role: 'reviewer', contentType: '*', actions: [] },
      ]);
      expect(await service.can('reviewer', 'blog', 'create')).toBe(false);
    });

    it('falls back to the base role\'s rows when it has none', async () => {
      mockPrisma.permission.findMany
        .mockResolvedValueOnce([]) // reviewer
        .mockResolvedValueOnce([{ role: 'contributor', contentType: '*', actions: ['read'] }]);
      expect(await service.can('reviewer', 'blog', 'create')).toBe(false);
      expect(mockPrisma.permission.findMany).toHaveBeenLastCalledWith({
        where: { role: 'contributor', contentType: { in: ['blog', '*'] } },
      });
    });

    it('falls back to the base role\'s defaults when neither has rows', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([]);
      expect(await service.can('reviewer', 'blog', 'create')).toBe(true);
      expect(await service.can('reviewer', 'blog', 'publish')).toBe(false);
      expect(await service.can('auditor', 'blog', 'create')).toBe(false);
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

  describe('upsert() — role validation', () => {
    it('accepts an existing custom role', async () => {
      mockPrisma.permission.upsert.mockResolvedValueOnce({});
      await expect(service.upsert('reviewer', 'blog', ['read'])).resolves.toBeDefined();
    });

    it('rejects admin and unknown roles', async () => {
      await expect(service.upsert('admin', 'blog', ['read'])).rejects.toThrow('Admin always has full access');
      await expect(service.upsert('ghost', 'blog', ['read'])).rejects.toThrow('Role "ghost" not found');
      expect(mockPrisma.permission.upsert).not.toHaveBeenCalled();
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
      expect(mockPrisma.permission.createMany).toHaveBeenCalledWith({
        data: [
          { role: 'editor',      contentType: '*', actions: ['create', 'read', 'update', 'delete', 'publish'] },
          { role: 'contributor', contentType: '*', actions: ['create', 'read', 'update'] },
          { role: 'viewer',      contentType: '*', actions: ['read'] },
        ],
      });
      expect(result.message).toContain('reset');
    });

    it("re-seeds each custom role's wildcard row from its base role's defaults", async () => {
      mockPrisma.role.findMany.mockResolvedValueOnce([
        { name: 'reviewer', baseRole: 'contributor' },
        { name: 'auditor', baseRole: 'viewer' },
      ]);

      await service.resetAll();
      const { data } = mockPrisma.permission.createMany.mock.calls[0][0];
      expect(data).toEqual(expect.arrayContaining([
        { role: 'reviewer', contentType: '*', actions: ['create', 'read', 'update'] },
        { role: 'auditor',  contentType: '*', actions: ['read'] },
      ]));
      expect(data).toHaveLength(5);
    });
  });
});
