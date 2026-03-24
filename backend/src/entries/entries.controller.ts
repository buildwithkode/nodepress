import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { EntriesService } from './entries.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('Entries')
@Controller('entries')
export class EntriesController {
  constructor(
    private readonly entriesService: EntriesService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Write — editor or admin ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new entry (editor or admin)' })
  @ApiResponse({ status: 201, description: 'Entry created' })
  @ApiResponse({ status: 409, description: 'Slug already exists in this content type' })
  async create(@Body() dto: CreateEntryDto, @Request() req: any) {
    const entry = await this.entriesService.create(dto, req.user.id) as any;
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'entry', entry.slug,
      { contentType: entry.contentType?.name },
    );
    return entry;
  }

  // ─── Read — any authenticated user (viewer+) ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List entries with pagination + search (viewer, editor, admin)' })
  @ApiQuery({ name: 'contentTypeId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published', 'archived'] })
  @ApiQuery({ name: 'deleted', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Full-text search on slug and data fields' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  findAll(
    @Query('contentTypeId') contentTypeId?: string,
    @Query('status') status?: string,
    @Query('deleted') deleted?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const ctId = contentTypeId ? parseInt(contentTypeId, 10) : undefined;
    return this.entriesService.findAll({
      contentTypeId: ctId && !isNaN(ctId) ? ctId : undefined,
      status,
      deleted: deleted === 'true',
      search: search?.trim() || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a single entry by ID (viewer, editor, admin)' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update an entry — auto-snapshots a version before saving (editor or admin)' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntryDto,
    @Request() req: any,
  ) {
    const entry = await this.entriesService.update(id, dto, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'entry', entry.slug,
      { status: entry.status },
    );
    return entry;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Delete(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Soft-delete an entry (moves to trash)' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const entry = await this.entriesService.findOne(id);
    const result = await this.entriesService.remove(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'entry', entry.slug,
    );
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post(':id/restore')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Restore a trashed entry' })
  @ApiParam({ name: 'id', type: Number })
  async restore(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const entry = await this.entriesService.restore(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'restored', 'entry', entry.slug,
    );
    return entry;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id/purge')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Permanently delete a trashed entry (admin only — irreversible)' })
  @ApiParam({ name: 'id', type: Number })
  purge(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.purge(id);
  }

  // ─── Version history ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get(':id/versions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List version history for an entry (up to 50 most recent)' })
  @ApiParam({ name: 'id', type: Number })
  listVersions(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.listVersions(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post(':id/versions/:versionId/restore')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Restore a specific version of an entry (auto-snapshots current before overwriting)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'versionId', type: Number })
  async restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Request() req: any,
  ) {
    const entry = await this.entriesService.restoreVersion(id, versionId, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'entry', entry.slug,
      { restoredFromVersion: versionId },
    );
    return entry;
  }
}
