import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedirectsController, RedirectsPublicController } from './redirects.controller';
import { RedirectsService } from './redirects.service';

/** Global so EntriesService can add a redirect when a published entry's slug changes. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RedirectsPublicController, RedirectsController],
  providers: [RedirectsService],
  exports: [RedirectsService],
})
export class RedirectsModule {}
