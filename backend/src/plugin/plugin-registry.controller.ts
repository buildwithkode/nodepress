import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PluginRegistryService } from './plugin-registry.service';

/**
 * Plugins → Browse. Registered before PluginApiController so `GET /plugins/registry`
 * isn't taken by its `GET /plugins/:id`.
 */
@ApiTags('Plugins')
@Controller('plugins/registry')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class PluginRegistryController {
  constructor(private readonly registry: PluginRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'Plugins listed in the plugin directory (PLUGIN_REGISTRY_URL), with installed/compatible flags (Admin only)' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  list(@Query('refresh') refresh?: string) {
    return this.registry.list(refresh === 'true' || refresh === '1');
  }

  @Post(':id/install')
  @ApiOperation({ summary: 'Download a listed plugin, verify its sha256 and install it like an upload — ?dryRun=true only reviews it (Admin only)' })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  install(@Param('id') id: string, @Query('dryRun') dryRun?: string, @Req() req?: any) {
    return this.registry.install(id, dryRun === 'true' || dryRun === '1', req?.user?.email || 'admin');
  }
}
