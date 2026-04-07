import { Module } from '@nestjs/common';
import { SchemaValidator } from './schema.validator';
import { DataValidator } from './data.validator';
import { FormGenerator } from './form.generator';

@Module({
  providers: [SchemaValidator, DataValidator, FormGenerator],
  exports: [SchemaValidator, DataValidator, FormGenerator],
})
export class FieldsModule {}
