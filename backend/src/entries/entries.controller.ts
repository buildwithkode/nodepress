import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards, Request,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { EntriesService } from './entries.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';

@ApiTags('Entries')
@Controller('entries')
export class EntriesController {
  constructor(
    private readonly entriesService: EntriesService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ─── Write — editor, contributor, or admin ────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new entry (contributor, editor, or admin)' })
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
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published', 'archived', 'pending_review'] })
  @ApiQuery({ name: 'deleted', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Full-text search on slug and data fields' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'locale', required: false, type: String, description: 'Filter by locale (e.g. en, fr, de)' })
  findAll(
    @Query('contentTypeId') contentTypeId?: string,
    @Query('status') status?: string,
    @Query('deleted') deleted?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
  ) {
    const ctId = contentTypeId ? parseInt(contentTypeId, 10) : undefined;
    return this.entriesService.findAll({
      contentTypeId: ctId && !isNaN(ctId) ? ctId : undefined,
      status,
      deleted: deleted === 'true',
      search: search?.trim() || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      locale: locale?.trim() || undefined,
    });
  }

  // ─── Import / Export — MUST be before @Get(':id') to avoid route shadowing ─
  // NestJS registers routes in declaration order. A static segment like "export"
  // must appear before a wildcard like ":id", otherwise GET /entries/export
  // would match :id='export' and ParseIntPipe would throw 400.

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @SkipThrottle()
  @Get('export')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Export all entries for a content type as JSON (editor, admin)',
    description: 'Returns a flat JSON array of all non-deleted entries. Use the response to seed, back up, or migrate content.',
  })
  @ApiQuery({ name: 'contentTypeId', required: true, type: Number })
  exportEntries(@Query('contentTypeId') contentTypeId: string) {
    const id = parseInt(contentTypeId, 10);
    if (isNaN(id)) throw new BadRequestException('contentTypeId must be a number');
    return this.entriesService.exportEntries(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post('import')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Import entries into a content type from a JSON array (editor, admin)',
    description:
      'Upserts entries by slug + locale. Existing (non-deleted) entries are updated; new entries are created. ' +
      'Returns `{ created, updated, errors }`. Rows with missing slugs are skipped and listed in `errors`.',
  })
  async importEntries(
    @Body('contentTypeId') contentTypeId: number,
    @Body('entries') entries: any[],
    @Request() req: any,
  ) {
    if (!contentTypeId) throw new BadRequestException('contentTypeId is required');
    if (!Array.isArray(entries)) throw new BadRequestException('entries must be an array');
    const result = await this.entriesService.importEntries(contentTypeId, entries, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'entry', `import:contentType:${contentTypeId}`,
      { created: result.created, updated: result.updated, errors: result.errors.length },
    );
    return result;
  }

  // ─── Bulk operations — also static paths, must precede :id wildcards ───────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post('bulk-delete')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk soft-delete entries' })
  bulkDelete(@Body() dto: BulkActionDto) {
    return this.entriesService.bulkDelete(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post('bulk-publish')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk publish entries' })
  bulkPublish(@Body() dto: BulkActionDto) {
    return this.entriesService.bulkPublish(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post('bulk-archive')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk archive entries' })
  bulkArchive(@Body() dto: BulkActionDto) {
    return this.entriesService.bulkArchive(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Post('bulk-pending-review')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk set entries to pending_review — contributors can submit work for approval' })
  bulkPendingReview(@Body() dto: BulkActionDto) {
    return this.entriesService.bulkSetPendingReview(dto.ids);
  }

  // ─── Single entry by ID (wildcard — must come after all static GET paths) ──

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a single entry by ID — optionally populate relation fields' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'populate', required: false, type: String, description: 'Comma-separated relation field names to inline-populate' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('populate') populate?: string,
  ) {
    const fields = populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : [];
    return this.entriesService.findOne(id, fields);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update an entry — auto-snapshots a version before saving (contributor, editor, or admin)' })
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
    const contentTypeName = (entry as any).contentType?.name;
    if (req.user.role !== 'admin' && contentTypeName) {
      const allowed = await this.permissionsService.can(req.user.role, contentTypeName, 'delete');
      if (!allowed) throw new ForbiddenException('You do not have permission to delete entries of this content type');
    }
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

  // ─── Content preview ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Post(':id/preview-url')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Generate a 1-hour signed preview token for a draft entry',
    description:
      'Returns a `token` and `expiresAt`. Pass the token as `?token=<token>` to ' +
      '`GET /api/:type/:slug/preview` to read the entry regardless of its publish status.',
  })
  @ApiParam({ name: 'id', type: Number })
  generatePreviewUrl(@Param('id', ParseIntPipe) id: number) {
    return this.entriesService.generatePreviewToken(id);
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
