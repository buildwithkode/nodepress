import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  imports: [PermissionsModule],
  controllers: [ReleasesController],
  providers: [ReleasesService],
})
export class ReleasesModule {}
