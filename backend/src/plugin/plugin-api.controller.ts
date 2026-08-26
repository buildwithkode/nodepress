import { Body, Controller, Get, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PluginService } from './plugin.service';
import { PluginHookBus } from './plugin-hook-bus';

@ApiTags('Plugins')
@Controller('plugins')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
export class PluginApiController {
  constructor(
    private readonly pluginService: PluginService,
    private readonly hookBus: PluginHookBus,
  ) {}

  @Get()
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'List all registered plugins, active state, and configuration' })
  list() {
    return this.pluginService.listPlugins();
  }

  @Get('hooks')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Get summary of registered lifecycle hooks and filters' })
  getHooks() {
    return this.hookBus.getSummary();
  }

  @Get(':id')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Get details and config for a single plugin' })
  getOne(@Param('id') id: string) {
    return this.pluginService.getPlugin(id);
  }

  @Patch(':id/toggle')
  @Roles('admin')
  @ApiOperation({ summary: 'Enable or disable a plugin (Admin only)' })
  @ApiBody({ schema: { type: 'object', properties: { enabled: { type: 'boolean' } } } })
  toggle(
    @Param('id') id: string,
    @Body('enabled') enabled?: boolean,
    @Req() req?: any,
  ) {
    const userEmail = req?.user?.email || 'admin';
    return this.pluginService.togglePlugin(id, enabled, userEmail);
  }

  @Put(':id/config')
  @Roles('admin')
  @ApiOperation({ summary: 'Update runtime configuration for a plugin (Admin only)' })
  @ApiBody({ schema: { type: 'object', description: 'Key-value config object' } })
  updateConfig(
    @Param('id') id: string,
    @Body() config: Record<string, any>,
    @Req() req?: any,
  ) {
    const userEmail = req?.user?.email || 'admin';
    return this.pluginService.updatePluginConfig(id, config, userEmail);
  }
}
