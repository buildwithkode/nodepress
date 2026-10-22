import { Module } from '@nestjs/common';
import { ContentTypeModule } from '../content-type/content-type.module';
import { EntriesModule } from '../entries/entries.module';
import { MediaModule } from '../media/media.module';
import { ImporterController } from './importer.controller';
import { ImporterService } from './importer.service';

/** WordPress (WXR) import — POST /api/import/wordpress, run as an `import.wordpress` job. */
@Module({
  imports: [ContentTypeModule, EntriesModule, MediaModule],
  controllers: [ImporterController],
  providers: [ImporterService],
})
export class ImporterModule {}
