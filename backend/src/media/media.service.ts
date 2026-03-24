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

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly uploadsDir = resolve(join(process.cwd(), 'uploads'));

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private storage: StorageAdapter,
    private auditService: AuditService,
    private webhooks: WebhooksService,
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
    const record = await (this.prisma as any).media.create({
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

    return record;
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      (this.prisma as any).media.count(),
      (this.prisma as any).media.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async remove(filename: string, actor?: { id: number; email: string; ip?: string }) {
    // Validate — no path traversal
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }
    const safe = basename(filename);

    // Find record in DB
    const record = await (this.prisma as any).media.findUnique({ where: { filename: safe } });

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
      await (this.prisma as any).media.delete({ where: { filename: safe } });
    }

    if (actor) {
      await this.auditService.log(
        { id: actor.id, email: actor.email, ip: actor.ip },
        'deleted', 'media', safe,
      );
    }

    this.webhooks.fire('media.deleted', { filename: safe });

    return { message: `File "${filename}" deleted` };
  }
}
