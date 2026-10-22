import { Module } from '@nestjs/common';
import { ServerSettingsController } from './server-settings.controller';
import { ServerSettingsService } from './server-settings.service';

@Module({
  controllers: [ServerSettingsController],
  providers: [ServerSettingsService],
})
export class ServerSettingsModule {}
