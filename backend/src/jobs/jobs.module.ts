import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JobsService } from './jobs.service';
import { JobWorker } from './job-worker.service';

/** Global so any module (forms, plugins) can enqueue jobs and register handlers. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [JobsService, JobWorker],
  exports: [JobsService],
})
export class JobsModule {}
