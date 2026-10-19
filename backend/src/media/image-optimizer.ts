import { Logger } from '@nestjs/common';
import { join, dirname, basename, extname } from 'path';
import { existsSync, unlinkSync } from 'fs';

const logger = new Logger('ImageOptimizer');

const MAX_PX = parseInt(process.env.MEDIA_MAX_DIMENSION ?? '2400', 10);

/**
 * Concurrency gate: max 3 simultaneous sharp operations.
 * Beyond this we skip optimization and return null so the upload still succeeds.
 * The libuv thread pool is set to 16 (in main.ts) to prevent pool starvation.
 */
let activeOptimizations = 0;
const MAX_CONCURRENT_OPTIMIZATIONS = 3;

export interface OptimizedImage {
  /** Path to the optimized original file (replaces the Multer temp file in-place) */
  path: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** File size after optimization (bytes) */
  size: number;
  /** Path to the generated WebP version (same location, .webp extension) */
  webpPath: string;
  /** WebP file size (bytes) */
  webpSize: number;
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isOptimizableImage(mimetype: string): boolean {
  return IMAGE_MIMES.has(mimetype);
}

/**
 * Run a file through sharp:
 * 1. Auto-orient from EXIF rotation data
 * 2. Resize to max MAX_PX × MAX_PX (preserves aspect ratio, never upscales)
 * 3. Re-encode with quality optimizations
 * 4. Generate a .webp sibling for modern browsers
 *
 * Returns metadata for both the original and WebP versions.
 * If sharp processing fails for any reason, logs the error and returns null
 * so the upload still succeeds with the unprocessed file.
 */
export async function optimizeImage(
  localPath: string,
  mimetype: string,
): Promise<OptimizedImage | null> {
  if (activeOptimizations >= MAX_CONCURRENT_OPTIMIZATIONS) {
    logger.warn(
      `Image optimization skipped for ${basename(localPath)}: too many concurrent operations (${activeOptimizations}/${MAX_CONCURRENT_OPTIMIZATIONS})`,
    );
    return null;
  }

  activeOptimizations++;
  try {
    // Dynamic import — works in both CJS (sharp@0.32) and ESM (sharp@0.33)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');

    const dir = dirname(localPath);
    const name = basename(localPath, extname(localPath));
    const webpPath = join(dir, `${name}.webp`);

    // Base pipeline: auto-orient + cap dimensions
    const pipeline = () =>
      sharp(localPath)
        .rotate()                                                    // auto-orient EXIF
        .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true });

    // 1. Optimize original format in-place
    let result: { width: number; height: number; size: number };

    if (mimetype === 'image/jpeg') {
      result = await pipeline()
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toFile(localPath + '.tmp');
    } else if (mimetype === 'image/png') {
      result = await pipeline()
        .png({ compressionLevel: 8, adaptiveFiltering: true })
        .toFile(localPath + '.tmp');
    } else if (mimetype === 'image/webp') {
      result = await pipeline()
        .webp({ quality: 82 })
        .toFile(localPath + '.tmp');
    } else if (mimetype === 'image/gif') {
      // GIF: just get dimensions, skip compression (sharp gif support is limited)
      const meta = await sharp(localPath).metadata();
      return {
        path: localPath,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        size: require('fs').statSync(localPath).size,
        webpPath,
        webpSize: 0,
      };
    } else {
      return null;
    }

    // Atomically replace the original with the optimized version
    const { renameSync } = require('fs');
    renameSync(localPath + '.tmp', localPath);

    // 2. Generate WebP sibling
    const webpResult = await pipeline()
      .webp({ quality: 82 })
      .toFile(webpPath);

    logger.log(
      `Optimized ${basename(localPath)}: ` +
      `${result.width}×${result.height}px · ${(result.size / 1024).toFixed(1)}KB · ` +
      `WebP: ${(webpResult.size / 1024).toFixed(1)}KB`,
    );

    return {
      path: localPath,
      width: result.width,
      height: result.height,
      size: result.size,
      webpPath,
      webpSize: webpResult.size,
    };
  } catch (err) {
    // Optimization failure must never block the upload
    logger.warn(`Image optimization skipped for ${basename(localPath)}: ${err}`);

    // Clean up any tmp file that may be left behind
    if (existsSync(localPath + '.tmp')) {
      try { unlinkSync(localPath + '.tmp'); } catch { /* ignore */ }
    }

    return null;
  } finally {
    activeOptimizations--;
  }
}
