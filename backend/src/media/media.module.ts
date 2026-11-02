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
import { adapterFromEnv, adapterFromSaved, isStorageDriver, StorageDriver } from './adapters/storage-config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chosen once at boot: STORAGE_DRIVER when set, else the storage saved in the
 * admin (Settings → Email & storage), else local disk. Changing the saved
 * setting takes effect after a restart. See adapters/storage-config.ts.
 */
let bootStorage: StorageDriver | null = null;

/** The storage driver this process started with (null before MediaModule boots). */
export const activeStorageDriver = () => bootStorage;

const storageAdapterProvider = {
  provide: STORAGE_ADAPTER,
  inject: [PrismaService],
  useFactory: async (prisma: PrismaService) => {
    // Multer stages every upload in uploads/ before the adapter stores it (even
    // for remote storage), and the health check reports this directory. Create it
    // at boot so a fresh install isn't "unhealthy" until the first upload.
    mkdirSync(join(process.cwd(), 'uploads'), { recursive: true });
    const logger = new Logger('MediaModule');
    const driver = process.env.STORAGE_DRIVER;
    if (isStorageDriver(driver) && driver !== 'local') {
      bootStorage = driver;
      return adapterFromEnv(driver);
    }
    if (!driver) {
      const saved = await prisma.setting.findUnique({ where: { id: 1 }, select: { storage: true } }).catch(() => null);
      const chosen = adapterFromSaved(saved?.storage);
      if (chosen) {
        logger.log(`Storage: ${chosen.driver} (saved in Settings → Email & storage)`);
        bootStorage = chosen.driver;
        return chosen.adapter;
      }
      const savedDriver = (saved?.storage as any)?.driver;
      if (savedDriver && savedDriver !== 'local') {
        logger.error(`Saved ${savedDriver} storage settings are incomplete or can't be read (was SETTINGS_SECRET/JWT_SECRET changed?) — using local disk`);
      }
    }
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'Storage is local disk in production — uploads live on this container\'s disk. ' +
        'They are lost on redeploy without a persistent volume, and are invisible to other ' +
        'replicas when scaling horizontally. Set up S3, Cloudflare R2 or ImageKit in Settings → Email & storage or with STORAGE_DRIVER.',
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
