import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PluginRegistry } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';

@ApiTags('Plugins')
@Controller('plugins')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class PluginApiController {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly hookBus: PluginHookBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all registered plugins and their status' })
  list() {
    const hooksSummary = this.hookBus.getSummary();
    return {
      plugins: this.registry.getAll().map((p) => ({
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        description: p.manifest.description,
        permissions: p.manifest.permissions,
        enabled: p.enabled,
      })),
      meta: {
        totalPlugins: this.registry.count(),
        totalHooks: hooksSummary.totalHooks,
        totalFilters: hooksSummary.totalFilters,
        activeEvents: hooksSummary.events,
      },
    };
  }

  @Get('hooks')
  @ApiOperation({ summary: 'Get summary of registered lifecycle hooks and filters' })
  getHooks() {
    return this.hookBus.getSummary();
  }
}
