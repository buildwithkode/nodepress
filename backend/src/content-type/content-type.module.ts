import { Module } from '@nestjs/common';
import { ContentTypeController } from './content-type.controller';
import { ContentTypeService } from './content-type.service';
import { FieldsModule } from '../fields/fields.module';
import { FieldIndexService } from './field-index.service';
import { ComponentsModule } from '../components/components.module';
import { ChoiceListsModule } from '../choice-lists/choice-lists.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

// AppCacheService is provided globally via AppCacheModule (@Global) — no import needed.

@Module({
  imports: [FieldsModule, ComponentsModule, ChoiceListsModule, ApiKeysModule], // ApiKeysModule: FullAccessKeyOrJwtGuard on export/import
  controllers: [ContentTypeController],
  providers: [ContentTypeService, FieldIndexService],
  exports: [ContentTypeService],
})
export class ContentTypeModule {}
