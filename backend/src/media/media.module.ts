import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
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
    const driver = process.env.STORAGE_DRIVER ?? 'local';
    if (driver === 's3') return new S3StorageAdapter();
    return new LocalStorageAdapter();
  },
};

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [MediaService, storageAdapterProvider],
  exports: [MediaService],
})
export class MediaModule {}
