import { Module } from '@nestjs/common';
import { ContentTypeController } from './content-type.controller';
import { ContentTypeService } from './content-type.service';
import { FieldsModule } from '../fields/fields.module';

// AppCacheService is provided globally via AppCacheModule (@Global) — no import needed.

@Module({
  imports: [FieldsModule],
  controllers: [ContentTypeController],
  providers: [ContentTypeService],
  exports: [ContentTypeService],
})
export class ContentTypeModule {}
