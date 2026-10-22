import { Module } from '@nestjs/common';
import { FieldsModule } from '../fields/fields.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [FieldsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
