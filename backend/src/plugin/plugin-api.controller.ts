import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PluginService } from './plugin.service';
import { PluginHookBus } from './plugin-hook-bus';
import { pluginUploadSettings } from './plugin-upload.settings';

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
  list(@Req() req?: any) {
    return this.pluginService.listPlugins(req?.user?.role);
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
  getOne(@Param('id') id: string, @Req() req?: any) {
    return this.pluginService.getPlugin(id, req?.user?.role);
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

  @Post('packages')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: pluginUploadSettings().maxUploadBytes } }))
  @ApiOperation({ summary: 'Upload a plugin .zip — ?dryRun=true only checks it (Admin only). Takes effect after a restart.' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Query('dryRun') dryRun?: string, @Req() req?: any) {
    return this.pluginService.uploadPackage(file?.buffer, dryRun === 'true' || dryRun === '1', req?.user?.email || 'admin');
  }

  @Delete('packages/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete an uploaded plugin (it must be disabled). Takes effect after a restart.' })
  deletePackage(@Param('id') id: string, @Req() req?: any) {
    return this.pluginService.deletePackage(id, req?.user?.email || 'admin');
  }

  @Post('restart')
  @HttpCode(202)
  @Roles('admin')
  @ApiOperation({ summary: 'Restart this server to load plugin changes (needs Docker/PM2/systemd to start it again)' })
  restart(@Req() req?: any) {
    return this.pluginService.restart(req?.user?.email || 'admin');
  }
}
