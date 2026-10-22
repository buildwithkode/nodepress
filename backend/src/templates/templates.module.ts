import { Module } from '@nestjs/common';
import { ContentTypeModule } from '../content-type/content-type.module';
import { EntriesModule } from '../entries/entries.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [ContentTypeModule, EntriesModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
