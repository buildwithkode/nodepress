import {
  BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createWriteStream, existsSync, mkdirSync, promises as fsp, renameSync, statSync, utimesSync } from 'fs';
import { basename, join, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_ADAPTER, StorageAdapter } from './adapters/storage.adapter';
import {
  FocalPoint, MIME_TYPES, NormalizedTransform, TransformRequest,
  focalCoverRect, normalizeFocal, normalizeTransform, usesFocalPoint, variantName,
} from './image-transform';

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 15_000;
/** Requests allowed to wait for an encode slot before we answer 503. */
const MAX_QUEUED = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Variants untouched for this long are removed by the nightly prune. */
const VARIANT_MAX_AGE_DAYS = 30;

export interface TransformResult {
  filePath: string;
  contentType: string;
  size: number;
  /** Long-lived and immutable unless the output depends on a focal point the URL doesn't pin. */
  cacheControl: string;
  /** Set when the format was negotiated from Accept (format=auto). */
  vary?: string;
}

/**
 * On-the-fly image variants with a bounded disk cache.
 *
 * - Parameters are snapped to fixed buckets (see image-transform.ts).
 * - At most IMAGE_TRANSFORM_CONCURRENCY encodes run at once; up to MAX_QUEUED
 *   wait, the rest get 503 (a CDN retries later; cached variants are unaffected).
 * - Originals on S3 are fetched once into uploads/.cache/sources — only for
 *   files that exist in the media table, so this can't fetch arbitrary URLs.
 * - Cache hits refresh the file's mtime; a nightly job deletes variants unused
 *   for 30 days and the least recently used ones beyond IMAGE_VARIANT_CACHE_MB.
 */
@Injectable()
export class ImageTransformService {
  private readonly logger = new Logger(ImageTransformService.name);
  /** Where originals live locally (overridable in tests). */
  protected uploadsDir = resolve(join(process.cwd(), 'uploads'));
  private get variantsDir() { return join(this.uploadsDir, '.cache', 'variants'); }
  private get sourcesDir() { return join(this.uploadsDir, '.cache', 'sources'); }
  private readonly concurrency = Math.max(1, Number(process.env.IMAGE_TRANSFORM_CONCURRENCY) || 2);
  private readonly cacheLimitBytes = (Number(process.env.IMAGE_VARIANT_CACHE_MB) || 2048) * 1024 * 1024;
  private active = 0;
  private waiting: (() => void)[] = [];
  /** De-duplicates concurrent requests for the same variant. */
  private inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async transform(filename: string, req: TransformRequest, accept?: string): Promise<TransformResult> {
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }
    const safe = basename(filename);
    const t = normalizeTransform(req, accept);
    const media = await this.prisma.media.findUnique({ where: { filename: safe } });
    if (media && !media.mimetype.startsWith('image/')) throw new BadRequestException('Not an image');

    const focal = media ? normalizeFocal(media.focalX, media.focalY) : null;
    const variantPath = join(this.variantsDir, variantName(safe, t, focal));

    if (existsSync(variantPath)) {
      const now = new Date();
      try { utimesSync(variantPath, now, now); } catch { /* best effort */ }
    } else {
      const source = await this.sourcePath(safe, media?.url);
      await this.dedupe(variantPath, () => this.withSlot(() => this.render(source, variantPath, t, focal)));
    }

    // The URL pins the output unless it's a focal crop whose ?fp= doesn't match
    // the stored point — then a later focal change must reach clients within an hour.
    const pinned = !usesFocalPoint(t) || !focal || req.fp === `${focal.x},${focal.y}`;
    return {
      filePath: variantPath,
      contentType: MIME_TYPES[t.format],
      size: statSync(variantPath).size,
      cacheControl: pinned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      vary: t.negotiated ? 'Accept' : undefined,
    };
  }

  /** Local original, or a one-time download of the stored original (S3). */
  private async sourcePath(filename: string, url?: string): Promise<string> {
    const local = join(this.uploadsDir, filename);
    if (existsSync(local)) return local;
    if (!url || !/^https?:\/\//.test(url)) throw new NotFoundException(`Image "${filename}" not found`);

    const cached = join(this.sourcesDir, filename);
    if (existsSync(cached)) return cached;

    await this.dedupe(cached, async () => {
      mkdirSync(this.sourcesDir, { recursive: true });
      const res = await fetch(this.storage.getUrl(filename), { signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS) });
      if (!res.ok || !res.body) throw new NotFoundException(`Image "${filename}" not found in storage`);
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > MAX_SOURCE_BYTES) throw new BadRequestException('Image too large to transform');

      const tmp = `${cached}.tmp-${process.pid}-${Date.now()}`;
      let bytes = 0;
      const limited = Readable.fromWeb(res.body as any).on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_SOURCE_BYTES) limited.destroy(new BadRequestException('Image too large to transform'));
      });
      try {
        await pipeline(limited, createWriteStream(tmp));
        renameSync(tmp, cached);
      } catch (err) {
        await fsp.rm(tmp, { force: true });
        throw err;
      }
    });
    return cached;
  }

  private async render(source: string, outputPath: string, t: NormalizedTransform, focal: FocalPoint | null) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    mkdirSync(this.variantsDir, { recursive: true });

    let img = sharp(source, { limitInputPixels: 100_000_000 }).rotate();
    if (usesFocalPoint(t) && focal) {
      // Read dimensions after EXIF rotation by rendering the rotation first.
      const rotated = await img.toBuffer({ resolveWithObject: true });
      const rect = focalCoverRect(rotated.info.width, rotated.info.height, t.width!, t.height!, focal);
      img = sharp(rotated.data)
        .resize(rect.resizeW, rect.resizeH)
        .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    } else if (t.width || t.height) {
      img = img.resize(t.width, t.height, { fit: t.fit, withoutEnlargement: true });
    }

    if (t.format === 'webp') img = img.webp({ quality: t.quality });
    else if (t.format === 'avif') img = img.avif({ quality: t.quality });
    else if (t.format === 'jpeg') img = img.jpeg({ quality: t.quality, progressive: true, mozjpeg: true });
    else img = img.png({ compressionLevel: 8, adaptiveFiltering: true });

    const tmp = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await img.toFile(tmp);
      renameSync(tmp, outputPath);
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      throw err;
    }
  }

  private async dedupe(key: string, work: () => Promise<void>) {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const p = work().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private async withSlot<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= MAX_QUEUED) {
        throw new ServiceUnavailableException('Image transform queue is full — retry shortly');
      }
      await new Promise<void>((r) => this.waiting.push(r));
    } else {
      this.active++;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // hand the slot over
      else this.active--;
    }
  }

  /** Nightly: drop variants unused for 30 days, then the LRU ones above the size cap. */
  @Cron('15 3 * * *')
  async pruneCache(): Promise<{ removed: number; bytes: number }> {
    let removed = 0;
    let freed = 0;
    for (const dir of [this.variantsDir, this.sourcesDir]) {
      if (!existsSync(dir)) continue;
      const files = await Promise.all(
        (await fsp.readdir(dir)).map(async (name) => {
          const path = join(dir, name);
          const st = await fsp.stat(path).catch(() => null);
          return st?.isFile() ? { path, size: st.size, mtime: st.mtimeMs } : null;
        }),
      );
      const list = files.filter((f): f is { path: string; size: number; mtime: number } => !!f)
        .sort((a, b) => a.mtime - b.mtime); // least recently used first
      let total = list.reduce((s, f) => s + f.size, 0);
      const cutoff = Date.now() - VARIANT_MAX_AGE_DAYS * DAY_MS;
      for (const f of list) {
        if (f.mtime >= cutoff && total <= this.cacheLimitBytes) break;
        await fsp.rm(f.path, { force: true });
        total -= f.size;
        freed += f.size;
        removed++;
      }
    }
    if (removed) this.logger.log(`Pruned ${removed} cached image file(s), ${Math.round(freed / 1024 / 1024)} MB`);
    return { removed, bytes: freed };
  }
}
