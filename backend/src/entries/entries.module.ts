import { Module } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { EntryNotesService } from './entry-notes.service';
import { EntryShareService } from './entry-share.service';
import { EntryReviewController } from './entry-review.controller';
import { ShareController } from './share.controller';
import { FieldsModule } from '../fields/fields.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [FieldsModule, PrismaModule, RealtimeModule, AuthModule, PermissionsModule],
  controllers: [EntriesController, EntryReviewController, ShareController],
  providers: [EntriesService, EntryNotesService, EntryShareService],
  exports: [EntriesService],
})
export class EntriesModule {}
