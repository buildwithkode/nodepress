import { Module } from '@nestjs/common';
import { ChoiceListsController } from './choice-lists.controller';
import { ChoiceListsService } from './choice-lists.service';

// Imported by ContentTypeModule (which expands lists on every schema write).
// Must not import ContentTypeModule back — propagation resolves
// ContentTypeService through ModuleRef instead.
@Module({
  controllers: [ChoiceListsController],
  providers: [ChoiceListsService],
  exports: [ChoiceListsService],
})
export class ChoiceListsModule {}
