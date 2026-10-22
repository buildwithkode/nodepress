import {
  Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Put, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ReleasesService } from './releases.service';
import { AddReleaseItemsDto, CreateReleaseDto, ScheduleReleaseDto, UpdateReleaseDto } from './release.dto';

@ApiTags('Releases')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly releases: ReleasesService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List releases (any signed-in user)' })
  findAll() {
    return this.releases.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'A release with its entries and conflicts with other releases' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.releases.findOne(id);
  }

  @Roles('admin', 'editor')
  @Post()
  @ApiOperation({ summary: 'Create a release (editor or admin)' })
  async create(@Body() dto: CreateReleaseDto, @Request() req: any) {
    const release = await this.releases.create(dto, req.user.id);
    await this.log(req, 'created', release.id, { name: release.name });
    return release;
  }

  @Roles('admin', 'editor')
  @Patch(':id')
  @ApiOperation({ summary: 'Rename or describe a release' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReleaseDto) {
    return this.releases.update(id, dto);
  }

  @Roles('admin', 'editor')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a release (its entries are not touched)' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const res = await this.releases.remove(id);
    await this.log(req, 'deleted', id);
    return res;
  }

  @Roles('admin', 'editor')
  @Post(':id/items')
  @ApiOperation({ summary: 'Add entries (or change their action): publish | unpublish | archive' })
  addItems(@Param('id', ParseIntPipe) id: number, @Body() dto: AddReleaseItemsDto) {
    return this.releases.addItems(id, dto);
  }

  @Roles('admin', 'editor')
  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove an entry from a release' })
  removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number) {
    return this.releases.removeItem(id, itemId);
  }

  @Roles('admin', 'editor')
  @Put(':id/schedule')
  @ApiOperation({ summary: 'Publish automatically at scheduledAt (null unschedules)' })
  async schedule(@Param('id', ParseIntPipe) id: number, @Body() dto: ScheduleReleaseDto, @Request() req: any) {
    await this.assertCanPublish(req);
    const release = await this.releases.schedule(id, dto.scheduledAt);
    await this.log(req, 'updated', id, { scheduledAt: dto.scheduledAt });
    return release;
  }

  @Roles('admin', 'editor')
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish now — every change in one transaction' })
  async publish(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.assertCanPublish(req);
    const release = await this.releases.publish(id);
    await this.log(req, 'published', id, { entries: release.items.length });
    return release;
  }

  private async assertCanPublish(req: any) {
    if (req.user.role === 'admin') return;
    if (!(await this.permissions.can(req.user.customRole ?? req.user.role, '*', 'publish'))) {
      throw new ForbiddenException('You do not have permission to publish entries');
    }
  }

  private log(req: any, action: 'created' | 'updated' | 'deleted' | 'published', id: number, metadata?: Record<string, any>) {
    return this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, action, 'release', String(id), metadata);
  }
}
