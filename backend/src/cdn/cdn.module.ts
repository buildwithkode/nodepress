import { Module } from '@nestjs/common';
import { CdnPurgeService } from './cdn-purge.service';

/** CDN cache purging for the public API (JobsService comes from the global JobsModule). */
@Module({
  providers: [CdnPurgeService],
  exports: [CdnPurgeService],
})
export class CdnModule {}
