import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { normalizeRoleName } from './roles.constants';

const mockPrisma = {
  role: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn((args) => ({ __op: 'role.create', ...args })),
    update:     jest.fn(),
    delete:     jest.fn((args) => ({ __op: 'role.delete', ...args })),
  },
  permission: {
    findUnique: jest.fn(),
    upsert:     jest.fn((args) => ({ __op: 'permission.upsert', ...args })),
    deleteMany: jest.fn((args) => ({ __op: 'permission.deleteMany', ...args })),
  },
  user: {
    groupBy: jest.fn(),
    count:   jest.fn(),
  },
  $transaction: jest.fn(async (ops: any[]) => Promise.all(ops.map((op) => (op.__op === 'role.create' ? op.data : op)))),
};

const store = new Map<string, any>();
const mockCache = {
  get: jest.fn(async (k: string) => store.get(k)),
  set: jest.fn(async (k: string, v: any) => { store.set(k, v); }),
  del: jest.fn(async (k: string) => { store.delete(k); }),
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    store.clear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get(RolesService);
  });

  it('normalizeRoleName snake_cases', () => {
    expect(normalizeRoleName('  Content Reviewer ')).toBe('content_reviewer');
    expect(normalizeRoleName('SEO-Team!')).toBe('seo_team');
  });

  describe('findAll()', () => {
    it('lists the four built-ins (read-only) then custom roles, with user counts', async () => {
      mockPrisma.role.findMany.mockResolvedValue([
        { name: 'reviewer', label: 'Reviewer', description: null, baseRole: 'contributor', createdAt: new Date(), updatedAt: new Date() },
      ]);
      mockPrisma.user.groupBy.mockResolvedValue([
        { role: 'admin', _count: { _all: 1 } },
        { role: 'reviewer', _count: { _all: 3 } },
      ]);

      const roles = await service.findAll();
      expect(roles.map((r) => r.name)).toEqual(['admin', 'editor', 'contributor', 'viewer', 'reviewer']);
      expect(roles.slice(0, 4).every((r) => r.builtIn)).toBe(true);
      expect(roles[0].userCount).toBe(1);
      expect(roles[4]).toMatchObject({ builtIn: false, baseRole: 'contributor', userCount: 3 });
    });
  });

  describe('create()', () => {
    it('normalizes the name and seeds a wildcard permission row from the base role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const role = await service.create({ name: 'Blog Writer', label: 'Blog writer', baseRole: 'contributor' });
      expect(role).toMatchObject({ name: 'blog_writer', baseRole: 'contributor' });
      expect(mockPrisma.permission.upsert).toHaveBeenCalledWith({
        where: { role_contentType: { role: 'blog_writer', contentType: '*' } },
        create: { role: 'blog_writer', contentType: '*', actions: ['create', 'read', 'update'] },
        update: { actions: ['create', 'read', 'update'] },
      });
      expect(mockCache.del).toHaveBeenCalledWith('roles:def:blog_writer');
    });

    it('rejects built-in names, duplicates, admin as base and bad names', async () => {
      await expect(service.create({ name: 'Editor', label: 'x', baseRole: 'viewer' })).rejects.toThrow(ConflictException);
      await expect(service.create({ name: 'x', label: 'x', baseRole: 'admin' })).rejects.toThrow(BadRequestException);
      await expect(service.create({ name: '123', label: 'x', baseRole: 'viewer' })).rejects.toThrow(BadRequestException);
      await expect(service.create({ name: '!!!', label: 'x', baseRole: 'viewer' })).rejects.toThrow(BadRequestException);

      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer' });
      await expect(service.create({ name: 'reviewer', label: 'x', baseRole: 'viewer' })).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('updates editable fields and clears the cache', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.role.update.mockResolvedValue({ name: 'reviewer', baseRole: 'editor', label: 'Lead' });

      const { role, previous } = await service.update('reviewer', { label: 'Lead', baseRole: 'editor' });
      expect(role.baseRole).toBe('editor');
      expect(previous.baseRole).toBe('contributor');
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { name: 'reviewer' },
        data: { label: 'Lead', baseRole: 'editor' },
      });
      expect(mockCache.del).toHaveBeenCalledWith('roles:def:reviewer');
    });

    it('re-seeds the wildcard row with the new base defaults when it still has the old defaults', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.role.update.mockResolvedValue({ name: 'reviewer', baseRole: 'editor' });
      // Same actions as the contributor defaults, in another order.
      mockPrisma.permission.findUnique.mockResolvedValue({ role: 'reviewer', contentType: '*', actions: ['update', 'create', 'read'] });

      const { role, warnings } = await service.update('reviewer', { baseRole: 'editor' });
      expect(role.baseRole).toBe('editor');
      expect(warnings).toEqual([]);
      expect(mockPrisma.permission.upsert).toHaveBeenCalledWith({
        where: { role_contentType: { role: 'reviewer', contentType: '*' } },
        create: { role: 'reviewer', contentType: '*', actions: ['create', 'read', 'update', 'delete', 'publish'] },
        update: { actions: ['create', 'read', 'update', 'delete', 'publish'] },
      });
    });

    it('also seeds the row when the role has none', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.role.update.mockResolvedValue({ name: 'reviewer', baseRole: 'viewer' });
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await service.update('reviewer', { baseRole: 'viewer' });
      expect(mockPrisma.permission.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { actions: ['read'] } }));
    });

    it('keeps a customised wildcard row and returns a warning', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.role.update.mockResolvedValue({ name: 'reviewer', baseRole: 'editor' });
      mockPrisma.permission.findUnique.mockResolvedValue({ role: 'reviewer', contentType: '*', actions: ['read', 'update'] });

      const { warnings } = await service.update('reviewer', { baseRole: 'editor' });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/customised/);
      expect(mockPrisma.permission.upsert).not.toHaveBeenCalled();
    });

    it('leaves permissions alone when the base role does not change', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.role.update.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor', label: 'R' });

      const { warnings } = await service.update('reviewer', { label: 'R', baseRole: 'contributor' });
      expect(warnings).toEqual([]);
      expect(mockPrisma.permission.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.permission.upsert).not.toHaveBeenCalled();
    });

    it('refuses built-ins and unknown roles', async () => {
      await expect(service.update('viewer', { label: 'x' })).rejects.toThrow(BadRequestException);
      mockPrisma.role.findUnique.mockResolvedValue(null);
      await expect(service.update('ghost', { label: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('409s with the user count while the role is in use', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer' });
      mockPrisma.user.count.mockResolvedValue(2);

      const err = await service.remove('reviewer').catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ userCount: 2 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes the role and its permission rows when unused', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer' });
      mockPrisma.user.count.mockResolvedValue(0);

      await service.remove('reviewer');
      expect(mockPrisma.permission.deleteMany).toHaveBeenCalledWith({ where: { role: 'reviewer' } });
      expect(mockPrisma.role.delete).toHaveBeenCalledWith({ where: { name: 'reviewer' } });
      expect(mockCache.del).toHaveBeenCalledWith('roles:def:reviewer');
    });

    it('refuses built-ins', async () => {
      await expect(service.remove('admin')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolve()', () => {
    it('returns built-ins unchanged without a lookup', async () => {
      expect(await service.resolve('editor')).toEqual({ role: 'editor' });
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('maps a custom role to its base role and caches the lookup', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ baseRole: 'contributor' });
      expect(await service.resolve('reviewer')).toEqual({ role: 'contributor', customRole: 'reviewer' });
      expect(await service.resolve('reviewer')).toEqual({ role: 'contributor', customRole: 'reviewer' });
      expect(mockPrisma.role.findUnique).toHaveBeenCalledTimes(1);
    });

    it('falls back to viewer for a role that does not exist (cached too)', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      expect(await service.resolve('ghost')).toEqual({ role: 'viewer', customRole: 'ghost' });
      expect(await service.exists('ghost')).toBe(false);
      expect(mockPrisma.role.findUnique).toHaveBeenCalledTimes(1);
    });

    it('never resolves to admin even if the stored base role says so', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ baseRole: 'admin' });
      expect(await service.resolve('sneaky')).toEqual({ role: 'viewer', customRole: 'sneaky' });
    });
  });
});
