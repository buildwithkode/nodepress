import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Access } from '../auth/decorators/access.decorator';
import { AccessService } from '../roles/access.service';
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
    private readonly access: AccessService,
  ) {}

  /** Settings are shown to roles that may change them (masked secrets either way). */
  private async showSettings(user: any): Promise<boolean> {
    return !!user && (await this.access.allows(user, 'plugins', 'edit'));
  }

  // Open to every signed-in user: the admin reads plugin nav items from it.
  @Get()
  @ApiOperation({ summary: 'List all registered plugins, active state, and configuration (settings only for roles that can edit plugins)' })
  async list(@Req() req?: any) {
    return this.pluginService.listPlugins(req?.user?.role, await this.showSettings(req?.user));
  }

  @Get('hooks')
  @Access('plugins', 'view')
  @ApiOperation({ summary: 'Get summary of registered lifecycle hooks and filters' })
  getHooks() {
    return this.hookBus.getSummary();
  }

  @Get(':id')
  @Access('plugins', 'view')
  @ApiOperation({ summary: 'Get details and config for a single plugin' })
  async getOne(@Param('id') id: string, @Req() req?: any) {
    return this.pluginService.getPlugin(id, (await this.showSettings(req?.user)) ? 'admin' : req?.user?.role);
  }

  @Patch(':id/toggle')
  @Access('plugins', 'edit')
  @ApiOperation({ summary: 'Enable or disable a plugin' })
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
  @Access('plugins', 'edit')
  @ApiOperation({ summary: 'Update runtime configuration for a plugin' })
  @ApiBody({ schema: { type: 'object', description: 'Key-value config object' } })
  updateConfig(
    @Param('id') id: string,
    @Body() config: Record<string, any>,
    @Req() req?: any,
  ) {
    const userEmail = req?.user?.email || 'admin';
    return this.pluginService.updatePluginConfig(id, config, userEmail);
  }

  // Installing, removing and restarting run code on the server — admin only.
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
