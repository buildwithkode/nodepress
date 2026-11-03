import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ContentTypeModule } from '../content-type/content-type.module';
import { EntriesModule } from '../entries/entries.module';
import { FormsModule } from '../forms/forms.module';
import { SiteTransferController } from './site-transfer.controller';
import { SiteTransferService } from './site-transfer.service';

@Module({
  imports: [ApiKeysModule, ContentTypeModule, EntriesModule, FormsModule], // ApiKeysModule: FullAccessKeyOrJwtGuard
  controllers: [SiteTransferController],
  providers: [SiteTransferService],
})
export class SiteTransferModule {}
