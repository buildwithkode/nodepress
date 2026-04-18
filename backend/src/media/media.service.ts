import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { existsSync, statSync } from 'fs';
import { basename, resolve, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_ADAPTER, StorageAdapter } from './adapters/storage.adapter';
import { optimizeImage, isOptimizableImage } from './image-optimizer';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly uploadsDir = resolve(join(process.cwd(), 'uploads'));

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
    private auditService: AuditService,
    private webhooks: WebhooksService,
    private realtime: RealtimeGateway,
  ) {}

  /**
   * Process an upload from Multer:
   * 1. Optimize image if applicable (resize + WebP generation)
   * 2. Save to storage backend (local or S3)
   * 3. Persist metadata to DB
   */
  async processUpload(
    file: Express.Multer.File,
    actor?: { id: number; email: string; ip?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    let width: number | undefined;
    let height: number | undefined;
    let finalSize = file.size;
    let webpFilename: string | undefined;
    let webpUrl: string | undefined;

    // ── Image optimization ────────────────────────────────────────────────
    if (isOptimizableImage(file.mimetype)) {
      const optimized = await optimizeImage(file.path, file.mimetype);
      if (optimized) {
        width = optimized.width;
        height = optimized.height;
        finalSize = optimized.size;

        // Upload WebP sibling if it was generated and has non-zero size
        if (optimized.webpSize > 0 && existsSync(optimized.webpPath)) {
          const webpName = basename(optimized.webpPath);
          webpUrl = await this.storage.save(
            optimized.webpPath,
            webpName,
            'image/webp',
          );
          webpFilename = webpName;
        }
      }
    }

    // ── Save original to storage ──────────────────────────────────────────
    const url = await this.storage.save(file.path, file.filename, file.mimetype);

    // ── Persist metadata to DB ────────────────────────────────────────────
    const record = await this.prisma.media.create({
      data: {
        filename: file.filename,
        webpFilename: webpFilename ?? null,
        url,
        webpUrl: webpUrl ?? null,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: finalSize,
        width: width ?? null,
        height: height ?? null,
        uploadedBy: actor?.id ?? null,
      },
    });

    if (actor) {
      await this.auditService.log(
        { id: actor.id, email: actor.email, ip: actor.ip },
        'created', 'media', file.filename,
        { size: finalSize, width, height },
      );
    }

    this.webhooks.fire('media.uploaded', {
      filename: file.filename,
      originalName: file.originalname,
      url,
      webpUrl: webpUrl ?? null,
      size: finalSize,
      width: width ?? null,
      height: height ?? null,
    });

    this.realtime.notifyMediaUploaded({
      id: record.id,
      filename: record.filename,
      url: record.url,
      mimetype: record.mimetype,
    });

    return record;
  }

  async findAll(page = 1, limit = 50, folderId?: number | null) {
    const skip  = (page - 1) * limit;
    // folderId=null → unfiled (root); folderId=undefined → all files
    const where: any = folderId !== undefined ? { folderId } : {};
    const [total, data] = await Promise.all([
      this.prisma.media.count({ where }),
      this.prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Media Folders ─────────────────────────────────────────────────────────

  /** List all folders (flat list). The frontend builds the tree from parentId. */
  async listFolders() {
    return (this.prisma as any).mediaFolder.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
  }

  async createFolder(name: string, parentId?: number) {
    if (!name?.trim()) throw new BadRequestException('Folder name is required');
    try {
      return await (this.prisma as any).mediaFolder.create({
        data: { name: name.trim(), parentId: parentId ?? null },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(`A folder named "${name}" already exists here`);
      }
      throw err;
    }
  }

  async deleteFolder(id: number) {
    const folder = await (this.prisma as any).mediaFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder #${id} not found`);
    // ON DELETE CASCADE removes child folders; ON DELETE SET NULL unfiles media
    await (this.prisma as any).mediaFolder.delete({ where: { id } });
    return { message: `Folder "${folder.name}" deleted` };
  }

  /** Move a media file into a folder (or to root when folderId is null). */
  async moveToFolder(filename: string, folderId: number | null) {
    const safe = basename(filename);
    const record = await this.prisma.media.findUnique({ where: { filename: safe } });
    if (!record) throw new NotFoundException(`File "${filename}" not found`);
    if (folderId !== null) {
      const folder = await (this.prisma as any).mediaFolder.findUnique({ where: { id: folderId } });
      if (!folder) throw new NotFoundException(`Folder #${folderId} not found`);
    }
    return this.prisma.media.update({
      where: { filename: safe },
      data: { folderId },
    });
  }

  async remove(filename: string, actor?: { id: number; email: string; ip?: string }) {
    // Validate — no path traversal
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }
    const safe = basename(filename);

    // Find record in DB
    const record = await this.prisma.media.findUnique({ where: { filename: safe } });

    // Also check filesystem for local uploads that predate Phase 4 (no DB record)
    const localPath = join(this.uploadsDir, safe);
    const existsLocally = existsSync(localPath);

    if (!record && !existsLocally) {
      throw new NotFoundException(`File "${filename}" not found`);
    }

    // Delete from storage
    await this.storage.delete(safe);

    // Delete WebP sibling if it exists
    if (record?.webpFilename) {
      await this.storage.delete(record.webpFilename);
    }

    // Remove DB record
    if (record) {
      await this.prisma.media.delete({ where: { filename: safe } });
    }

    if (actor) {
      await this.auditService.log(
        { id: actor.id, email: actor.email, ip: actor.ip },
        'deleted', 'media', safe,
      );
    }

    this.webhooks.fire('media.deleted', { filename: safe });

    this.realtime.notifyMediaDeleted({ filename: safe });

    return { message: `File "${filename}" deleted` };
  }
}
