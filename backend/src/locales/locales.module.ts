import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LocalesController } from './locales.controller';
import { LocalesService } from './locales.service';

/** Global so the public API can read the default language for ?fallback=true. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [LocalesController],
  providers: [LocalesService],
  exports: [LocalesService],
})
export class LocalesModule {}
