import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ContentTypeModule } from '../content-type/content-type.module';
import { EntriesModule } from '../entries/entries.module';
import { FormsModule } from '../forms/forms.module';
import { ComponentsModule } from '../components/components.module';
import { ServerSettingsModule } from '../server-settings/server-settings.module';
import { SiteTransferController } from './site-transfer.controller';
import { SiteExtrasService } from './site-extras.service';
import { SiteTransferService } from './site-transfer.service';

@Module({
  imports: [ApiKeysModule, ContentTypeModule, EntriesModule, FormsModule, ComponentsModule, ServerSettingsModule], // ApiKeysModule: FullAccessKeyOrJwtGuard
  controllers: [SiteTransferController],
  providers: [SiteTransferService, SiteExtrasService],
})
export class SiteTransferModule {}
