import { Module } from '@nestjs/common';
import { FieldsModule } from '../fields/fields.module';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';

// Imported by ContentTypeModule (which expands components on every schema
// write). Must not import ContentTypeModule back — propagation resolves
// ContentTypeService through ModuleRef instead.
@Module({
  imports: [FieldsModule],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],
})
export class ComponentsModule {}
