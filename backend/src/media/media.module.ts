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
import { S3StorageAdapter } from './adapters/s3.adapter';

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
const storageAdapterProvider = {
  provide: STORAGE_ADAPTER,
  useFactory: () => {
    // Multer stages every upload in uploads/ before the adapter stores it (even
    // for S3), and the health check reports this directory. Create it at boot so
    // a fresh install isn't "unhealthy" until the first upload.
    mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });
    const driver = process.env.STORAGE_DRIVER ?? 'local';
    if (driver === 's3') return new S3StorageAdapter();
    if (process.env.NODE_ENV === 'production') {
      new Logger('MediaModule').warn(
        'STORAGE_DRIVER=local in production — uploads live on this container\'s disk. ' +
        'They are lost on redeploy without a persistent volume, and are invisible to other ' +
        'replicas when scaling horizontally. Use STORAGE_DRIVER=s3 (S3, R2, Spaces, MinIO).',
      );
    }
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
