import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PluginRegistry } from './plugin.registry';

@ApiTags('Plugins')
@Controller('plugins')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class PluginApiController {
  constructor(private readonly registry: PluginRegistry) {}

  @Get()
  @ApiOperation({ summary: 'List all registered plugins and their status' })
  list() {
    return this.registry.getAll().map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      permissions: p.manifest.permissions,
      enabled: p.enabled,
    }));
  }
}
