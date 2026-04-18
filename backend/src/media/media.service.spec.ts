import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_ADAPTER } from './adapters/storage.adapter';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const mockMedia = {
  id: 1,
  filename: '12345-abc.jpg',
  webpFilename: '12345-abc.webp',
  url: '/uploads/12345-abc.jpg',
  webpUrl: '/uploads/12345-abc.webp',
  originalName: 'photo.jpg',
  mimetype: 'image/jpeg',
  size: 4096,
  width: 800,
  height: 600,
  folderId: null,
  uploadedBy: null,
  createdAt: new Date(),
};

const mockPrisma = {
  media: {
    create:     jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
    findUnique: jest.fn(),
    delete:     jest.fn(),
    update:     jest.fn(),
  },
  mediaFolder: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    delete:     jest.fn(),
  },
};

// Proxy dynamic access (this.prisma as any).mediaFolder
Object.assign(mockPrisma, { mediaFolder: mockPrisma.mediaFolder });

const mockStorage = {
  save:   jest.fn().mockResolvedValue('/uploads/12345-abc.jpg'),
  delete: jest.fn().mockResolvedValue(undefined),
};

const mockAudit   = { log:   jest.fn().mockResolvedValue(undefined) };
const mockWebhook = { fire:  jest.fn() };
const mockRealtime = {
  notifyMediaUploaded: jest.fn(),
  notifyMediaDeleted:  jest.fn(),
};

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService,     useValue: mockPrisma   },
        { provide: STORAGE_ADAPTER,   useValue: mockStorage  },
        { provide: AuditService,      useValue: mockAudit    },
        { provide: WebhooksService,   useValue: mockWebhook  },
        { provide: RealtimeGateway,   useValue: mockRealtime },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated media with meta', async () => {
      mockPrisma.media.count.mockResolvedValue(1);
      mockPrisma.media.findMany.mockResolvedValue([mockMedia]);

      const result = await service.findAll(1, 50);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('filters by folderId when provided', async () => {
      mockPrisma.media.count.mockResolvedValue(0);
      mockPrisma.media.findMany.mockResolvedValue([]);

      await service.findAll(1, 50, 3);

      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { folderId: 3 } }),
      );
    });

    it('filters for unfiled (root) when folderId is null', async () => {
      mockPrisma.media.count.mockResolvedValue(0);
      mockPrisma.media.findMany.mockResolvedValue([]);

      await service.findAll(1, 50, null);

      expect(mockPrisma.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { folderId: null } }),
      );
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    beforeEach(() => {
      // file exists in DB and on disk
      mockPrisma.media.findUnique.mockResolvedValue(mockMedia);
      mockPrisma.media.delete.mockResolvedValue(mockMedia);
      // Mock existsSync / statSync via jest.mock — we just verify storage.delete calls
    });

    it('rejects path traversal attempts', async () => {
      await expect(service.remove('../etc/passwd')).rejects.toThrow(BadRequestException);
      await expect(service.remove('../../secret')).rejects.toThrow(BadRequestException);
    });
  });

  // ── createFolder ────────────────────────────────────────────────────────────

  describe('createFolder()', () => {
    it('throws BadRequestException for blank name', async () => {
      await expect(service.createFolder('   ')).rejects.toThrow(BadRequestException);
      await expect(service.createFolder('')).rejects.toThrow(BadRequestException);
    });

    it('creates a folder and returns it', async () => {
      const folder = { id: 1, name: 'Photos', parentId: null };
      mockPrisma.mediaFolder.create.mockResolvedValue(folder);

      const result = await service.createFolder('Photos');
      expect(result).toEqual(folder);
      expect(mockPrisma.mediaFolder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Photos', parentId: null } }),
      );
    });
  });

  // ── deleteFolder ────────────────────────────────────────────────────────────

  describe('deleteFolder()', () => {
    it('throws NotFoundException when folder does not exist', async () => {
      mockPrisma.mediaFolder.findUnique.mockResolvedValue(null);
      await expect(service.deleteFolder(99)).rejects.toThrow(NotFoundException);
    });

    it('deletes an existing folder', async () => {
      const folder = { id: 2, name: 'Videos', parentId: null };
      mockPrisma.mediaFolder.findUnique.mockResolvedValue(folder);
      mockPrisma.mediaFolder.delete.mockResolvedValue(folder);

      const result = await service.deleteFolder(2);
      expect(result.message).toContain('Videos');
    });
  });

  // ── moveToFolder ────────────────────────────────────────────────────────────

  describe('moveToFolder()', () => {
    it('throws NotFoundException for unknown file', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(null);
      await expect(service.moveToFolder('missing.jpg', null)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for unknown folder', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(mockMedia);
      mockPrisma.mediaFolder.findUnique.mockResolvedValue(null);
      await expect(service.moveToFolder('12345-abc.jpg', 99)).rejects.toThrow(NotFoundException);
    });

    it('moves file to a folder successfully', async () => {
      const folder = { id: 5, name: 'Archive', parentId: null };
      mockPrisma.media.findUnique.mockResolvedValue(mockMedia);
      mockPrisma.mediaFolder.findUnique.mockResolvedValue(folder);
      mockPrisma.media.update.mockResolvedValue({ ...mockMedia, folderId: 5 });

      const result = await service.moveToFolder('12345-abc.jpg', 5);
      expect(result.folderId).toBe(5);
    });

    it('moves file to root (folderId null) without folder lookup', async () => {
      mockPrisma.media.findUnique.mockResolvedValue(mockMedia);
      mockPrisma.media.update.mockResolvedValue({ ...mockMedia, folderId: null });

      const result = await service.moveToFolder('12345-abc.jpg', null);
      expect(result.folderId).toBeNull();
      expect(mockPrisma.mediaFolder.findUnique).not.toHaveBeenCalled();
    });
  });
});
