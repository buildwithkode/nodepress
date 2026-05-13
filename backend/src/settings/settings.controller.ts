import { Controller, Get, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpsertSettingsDto } from './dto/upsert-settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public — no auth required. Returns { key: value } flat map for use in frontend apps. */
  @Get('public')
  @ApiOperation({ summary: 'Get all settings as a flat key→value map (public, no auth)' })
  getPublic() {
    return this.settings.findPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all settings (admin)' })
  findAll() {
    return this.settings.findAll();
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk create or update settings (admin)' })
  upsert(@Body() dto: UpsertSettingsDto) {
    return this.settings.upsertMany(dto.settings);
  }

  @Delete(':key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a setting by key (admin)' })
  @ApiParam({ name: 'key', description: 'Setting key' })
  remove(@Param('key') key: string) {
    return this.settings.remove(key);
  }
}
