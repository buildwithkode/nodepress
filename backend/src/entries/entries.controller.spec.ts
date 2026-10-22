import { ForbiddenException } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { PermissionsService } from '../permissions/permissions.service';

// Bulk routes check the content permission of every affected content type.
describe('EntriesController — bulk permission checks', () => {
  const entriesService = {
    bulkDelete: jest.fn().mockResolvedValue({ affected: 2 }),
    bulkPublish: jest.fn().mockResolvedValue({ affected: 2 }),
    bulkArchive: jest.fn().mockResolvedValue({ affected: 2 }),
    bulkSetPendingReview: jest.fn().mockResolvedValue({ affected: 2 }),
    bulkStage: jest.fn().mockResolvedValue({ affected: 2 }),
    bulkPromote: jest.fn().mockResolvedValue({ affected: 2 }),
  };
  // reviewer may publish blog but not news; everything else is allowed.
  const can = jest.fn(async (role: string, type: string, action: string) =>
    !(role === 'reviewer' && type === 'news' && (action === 'publish' || action === 'delete')));
  const prisma = {
    entry: {
      findMany: jest.fn().mockResolvedValue([
        { contentType: { name: 'blog' } },
        { contentType: { name: 'news' } },
        { contentType: { name: 'blog' } },
      ]),
    },
  };
  // The real shared checks (assertCanEntries) on top of a mocked can() and Prisma.
  const permissions = Object.assign(Object.create(PermissionsService.prototype), { prisma, can });
  const controller = new EntriesController(entriesService as any, {} as any, permissions as any, prisma as any);
  const reviewer = { id: 2, role: 'editor', customRole: 'reviewer' };
  const dto = { ids: [1, 2, 3] };

  beforeEach(() => jest.clearAllMocks());

  it('rejects the whole request with the forbidden types, without touching entries', async () => {
    const err = await controller.bulkPublish(dto, { user: reviewer }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ forbiddenContentTypes: ['news'] });
    expect(entriesService.bulkPublish).not.toHaveBeenCalled();
    // Checked against the custom role, once per distinct type.
    expect(permissions.can).toHaveBeenCalledWith('reviewer', 'blog', 'publish');
    expect(permissions.can).toHaveBeenCalledWith('reviewer', 'news', 'publish');
    expect(permissions.can).toHaveBeenCalledTimes(2);
    expect(prisma.entry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [1, 2, 3] }, deletedAt: null },
    }));
  });

  it('uses delete for bulk-delete and update for archive / review / stage', async () => {
    await expect(controller.bulkDelete(dto, { user: reviewer })).rejects.toThrow(ForbiddenException);
    await controller.bulkArchive(dto, { user: reviewer });
    await controller.bulkPendingReview(dto, { user: reviewer });
    await controller.bulkStage(dto, { user: reviewer });
    expect(entriesService.bulkArchive).toHaveBeenCalledWith([1, 2, 3]);
    expect(entriesService.bulkSetPendingReview).toHaveBeenCalledWith([1, 2, 3]);
    expect(entriesService.bulkStage).toHaveBeenCalledWith([1, 2, 3]);
    expect(permissions.can.mock.calls.filter((c) => c[2] === 'update')).toHaveLength(6);
  });

  it('bulk-promote needs publish only when promoting to published', async () => {
    await expect(controller.bulkPromote({ ids: [1, 2], status: 'published' }, { user: reviewer }))
      .rejects.toThrow(ForbiddenException);
    await controller.bulkPromote({ ids: [1, 2], status: 'staging' }, { user: reviewer });
    expect(entriesService.bulkPromote).toHaveBeenCalledWith([1, 2], 'staging', 2);
  });

  it('falls back to the base role without a custom role', async () => {
    await controller.bulkPublish(dto, { user: { id: 3, role: 'editor' } });
    expect(permissions.can).toHaveBeenCalledWith('editor', 'news', 'publish');
    expect(entriesService.bulkPublish).toHaveBeenCalled();
  });

  it('admin passes without any lookup', async () => {
    await controller.bulkDelete(dto, { user: { id: 1, role: 'admin' } });
    expect(prisma.entry.findMany).not.toHaveBeenCalled();
    expect(permissions.can).not.toHaveBeenCalled();
    expect(entriesService.bulkDelete).toHaveBeenCalled();
  });
});
