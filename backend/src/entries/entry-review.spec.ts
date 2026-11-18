import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntryNotesService, entryIdsOf } from './entry-notes.service';
import { EntryShareService, isShareToken } from './entry-share.service';
import { hashToken } from '../auth/token-hash';

const prisma: any = {
  onOperation: jest.fn(),
  entry: { findFirst: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Asha Rao', email: 'asha@example.test' }]) },
  entryNote: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  entryShareLink: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
  },
};

beforeEach(() => jest.clearAllMocks());

describe('EntryNotesService', () => {
  const notes = new EntryNotesService(prisma);

  it('reads entry ids from a where clause', () => {
    expect(entryIdsOf({ id: 4 })).toEqual([4]);
    expect(entryIdsOf({ id: { in: [1, 2, 'x'] } })).toEqual([1, 2]);
    expect(entryIdsOf({ slug: 'a' })).toEqual([]);
  });

  it('adds a trimmed change request and refuses empty or unknown kinds', async () => {
    prisma.entry.findFirst.mockResolvedValue({ id: 3 });
    await notes.add(3, 1, '  Fix the price  ', 'changes');
    expect(prisma.entryNote.create).toHaveBeenCalledWith({ data: { entryId: 3, userId: 1, kind: 'changes', body: 'Fix the price' } });
    await expect(notes.add(3, 1, '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(notes.add(3, 1, 'x', 'shout')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only lets the author or an admin delete a note', async () => {
    prisma.entryNote.findUnique.mockResolvedValue({ id: 9, entryId: 3, userId: 1 });
    await expect(notes.remove(3, 9, { id: 2, role: 'editor' })).rejects.toBeInstanceOf(ForbiddenException);
    await notes.remove(3, 9, { id: 2, role: 'admin' });
    expect(prisma.entryNote.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('refuses a note of another entry', async () => {
    prisma.entryNote.findUnique.mockResolvedValue({ id: 9, entryId: 4, userId: 1 });
    await expect(notes.setResolved(3, 9, 1, true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves open change requests when an entry goes to review or is published, from any write', async () => {
    notes.onModuleInit();
    const hook = prisma.onOperation.mock.calls[0][0];
    const next = jest.fn().mockResolvedValue({ count: 2 });

    await hook({ model: 'Entry', action: 'updateMany', args: { where: { id: { in: [5, 6] } }, data: { status: 'published' } } }, next);
    expect(prisma.entryNote.updateMany).toHaveBeenCalledWith({
      where: { entryId: { in: [5, 6] }, kind: 'changes', resolvedAt: null },
      data: { resolvedAt: expect.any(Date) },
    });

    prisma.entryNote.updateMany.mockClear();
    await hook({ model: 'Entry', action: 'update', args: { where: { id: 5 }, data: { status: 'draft' } } }, next);
    await hook({ model: 'Entry', action: 'update', args: { where: { id: 5 }, data: { data: {} } } }, next);
    expect(prisma.entryNote.updateMany).not.toHaveBeenCalled();
  });
});

describe('EntryShareService', () => {
  const entries: any = { generatePreviewToken: jest.fn().mockResolvedValue({ token: 'preview-jwt' }) };
  const share = new EntryShareService(prisma, entries);

  it('makes a token, stores only its hash and refuses other lifetimes', async () => {
    prisma.entry.findFirst.mockResolvedValue({ id: 3 });
    prisma.entryShareLink.create.mockImplementation(({ data }: any) => ({ id: 1, createdAt: new Date(), ...data }));
    const link = await share.create(3, 1, 7);
    expect(isShareToken(link.token)).toBe(true);
    const stored = prisma.entryShareLink.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashToken(link.token));
    expect(JSON.stringify(stored)).not.toContain(link.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    await expect(share.create(3, 1, 365)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens a link with public fields only, and a preview token when the type has a preview URL', async () => {
    const token = 'nps_' + 'a'.repeat(48);
    prisma.entryShareLink.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      entry: {
        id: 3, publicId: 'p-3', slug: 'offer', locale: 'en', status: 'draft', deletedAt: null, seo: null, updatedAt: new Date(),
        data: { title: 'Offer', notes: 'internal' },
        contentType: {
          name: 'offers', displayName: 'Offers', previewUrl: 'https://site.test/preview?slug={slug}&token={token}',
          schema: [{ name: 'title', type: 'text' }, { name: 'notes', type: 'text', readRoles: ['admin'] }],
        },
      },
    });
    const view = await share.open(token);
    expect(prisma.entryShareLink.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken(token) } }));
    expect(view.entry.data).toEqual({ title: 'Offer' });
    expect(view.contentType.schema.map((f: any) => f.name)).toEqual(['title']);
    expect(view.previewToken).toBe('preview-jwt');
  });

  it('treats junk, expired links and trashed entries as gone', async () => {
    await expect(share.open('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.entryShareLink.findUnique).not.toHaveBeenCalled();
    const token = 'nps_' + 'b'.repeat(48);
    prisma.entryShareLink.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() - 1), entry: { deletedAt: null } });
    await expect(share.open(token)).rejects.toBeInstanceOf(NotFoundException);
    prisma.entryShareLink.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), entry: { deletedAt: new Date() } });
    await expect(share.open(token)).rejects.toBeInstanceOf(NotFoundException);
  });
});
