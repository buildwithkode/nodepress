import { Module } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { FieldsModule } from '../fields/fields.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [FieldsModule, PrismaModule],
  controllers: [EntriesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
