import { Logger, Module } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageTransformService } from './image-transform.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { STORAGE_ADAPTER } from './adapters/storage.adapter';
import { LocalStorageAdapter } from './adapters/local.adapter';
import { S3Config, S3StorageAdapter } from './adapters/s3.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { open } from '../common/secret-box';

/**
 * Factory selects the storage backend based on STORAGE_DRIVER env var.
 *
 * Local (default):
 *   STORAGE_DRIVER=local
 *
 * S3 / Cloudflare R2 / MinIO / Backblaze B2:
 *   STORAGE_DRIVER=s3
 *   STORAGE_S3_BUCKET=...
 *   STORAGE_S3_REGION=...      (use "auto" for R2)
 *   STORAGE_S3_ACCESS_KEY=...
 *   STORAGE_S3_SECRET_KEY=...
 *   STORAGE_S3_ENDPOINT=...    (optional — required for R2/MinIO)
 *   STORAGE_S3_PUBLIC_URL=...  (optional — CDN domain)
 */
/** Saved storage settings (Setting.storage) → S3 config, or null when not set up for S3. */
export function s3FromSaved(saved: unknown): S3Config | null {
  const st = saved as Record<string, any> | null | undefined;
  if (!st || st.driver !== 's3' || !st.bucket || !st.accessKey) return null;
  const secretKey = open(st.secretKey);
  if (!secretKey) return null;
  return { bucket: st.bucket, region: st.region, accessKey: st.accessKey, secretKey, endpoint: st.endpoint, publicUrl: st.publicUrl };
}

/**
 * Chosen once at boot: STORAGE_DRIVER when set, else the storage saved in the
 * admin (Settings → Email & storage), else local disk. Changing the saved
 * setting takes effect after a restart.
 */
let bootStorage: 'local' | 's3' | null = null;

/** The storage driver this process started with (null before MediaModule boots). */
export const activeStorageDriver = () => bootStorage;

const storageAdapterProvider = {
  provide: STORAGE_ADAPTER,
  inject: [PrismaService],
  useFactory: async (prisma: PrismaService) => {
    // Multer stages every upload in uploads/ before the adapter stores it (even
    // for S3), and the health check reports this directory. Create it at boot so
    // a fresh install isn't "unhealthy" until the first upload.
    mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });
    const logger = new Logger('MediaModule');
    const driver = process.env.STORAGE_DRIVER;
    if (driver === 's3') {
      bootStorage = 's3';
      return new S3StorageAdapter();
    }
    if (!driver) {
      const saved = await prisma.setting.findUnique({ where: { id: 1 }, select: { storage: true } }).catch(() => null);
      const s3 = s3FromSaved(saved?.storage);
      if (s3) {
        logger.log(`Storage: S3 bucket "${s3.bucket}" (saved in Settings → Email & storage)`);
        bootStorage = 's3';
        return new S3StorageAdapter(s3);
      }
      if ((saved?.storage as any)?.driver === 's3') {
        logger.error('Saved S3 storage settings can\'t be read (was SETTINGS_SECRET/JWT_SECRET changed?) — using local disk');
      }
    }
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'Storage is local disk in production — uploads live on this container\'s disk. ' +
        'They are lost on redeploy without a persistent volume, and are invisible to other ' +
        'replicas when scaling horizontally. Set up S3 (S3, R2, Spaces, MinIO) in Settings → Email & storage or with STORAGE_DRIVER=s3.',
      );
    }
    bootStorage = 'local';
    return new LocalStorageAdapter();
  },
};

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [MediaController],
  providers: [MediaService, ImageTransformService, storageAdapterProvider],
  exports: [MediaService],
})
export class MediaModule {}
