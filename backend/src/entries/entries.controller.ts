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
import { CreateEntryDto, EntryStatus } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

/** Content permissions are checked against the custom role when the user has one. */
const permissionRole = (user: { role: string; customRole?: string }) => user.customRole ?? user.role;

@ApiTags('Entries')
@Controller('entries')
export class EntriesController {
  constructor(
    private readonly entriesService: EntriesService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Write — editor, contributor, or admin ────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new entry (needs create on the type, and publish to create it published)' })
  @ApiResponse({ status: 201, description: 'Entry created' })
  @ApiResponse({ status: 409, description: 'Slug already exists in this content type' })
  async create(@Body() dto: CreateEntryDto, @Request() req: any) {
    if (req.user.role !== 'admin') {
      const ct = await this.prisma.contentType.findUnique({ where: { id: dto.contentTypeId }, select: { name: true } });
      const ctName = ct?.name ?? '*';
      const allowed = await this.permissionsService.can(permissionRole(req.user), ctName, 'create');
      if (!allowed) throw new ForbiddenException('You do not have permission to create entries of this content type');
      if (dto.status === 'published') {
        const canPublish = await this.permissionsService.can(permissionRole(req.user), ctName, 'publish');
        if (!canPublish) throw new ForbiddenException('You do not have permission to publish entries');
      }
    }
    const entry = await this.entriesService.create(dto, req.user.id, req.user) as any;
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
    @Request() req?: any,
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
      role: req?.user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get('counts')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get entry counts and pending counts grouped by content type' })
  getCounts() {
    return this.entriesService.getCounts();
  }

  // ─── Import / Export — MUST be before @Get(':id') to avoid route shadowing ─
  // NestJS registers routes in declaration order. A static segment like "export"
  // must appear before a wildcard like ":id", otherwise GET /entries/export
  // would match :id='export' and ParseIntPipe would throw 400.

  @UseGuards(JwtAuthGuard, RolesGuard)
  @SkipThrottle()
  @Get('export')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Export all entries for a content type as JSON or CSV (needs read on the type)',
    description: 'Returns all non-deleted entries as JSON or formatted RFC 4180 CSV.',
  })
  @ApiQuery({ name: 'contentTypeId', required: true, type: Number })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async exportEntries(
    @Request() req: any,
    @Query('contentTypeId') contentTypeId: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    const id = parseInt(contentTypeId, 10);
    if (isNaN(id)) throw new BadRequestException('contentTypeId must be a number');
    await this.permissionsService.assertCanContentType(req.user, id, 'read');
    return this.entriesService.exportEntries(id, format || 'json');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('import')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Import entries into a content type (JSON or CSV) with Dry-Run support (needs create + update, and publish for published rows)',
    description: 'Accepts an array of entries or an object containing { entries, csvContent, dryRun, updateDuplicates }.',
  })
  @ApiQuery({ name: 'contentTypeId', required: true, type: Number })
  async importEntries(
    @Query('contentTypeId') contentTypeId: string,
    @Body() payload: any,
    @Request() req: any,
  ) {
    const id = parseInt(contentTypeId, 10);
    if (isNaN(id)) throw new BadRequestException('contentTypeId must be a number');
    await this.permissionsService.assertCanContentType(req.user, id, 'create');
    if (payload?.updateDuplicates !== false) await this.permissionsService.assertCanContentType(req.user, id, 'update');
    const rows = Array.isArray(payload) ? payload : payload?.entries;
    if (typeof payload?.csvContent === 'string' || (Array.isArray(rows) && rows.some((r: any) => r?.status === 'published'))) {
      await this.permissionsService.assertCanContentType(req.user, id, 'publish');
    }
    return this.entriesService.importEntries(id, payload, req.user.id);
  }

  // ─── Bulk operations — also static paths, must precede :id wildcards ───────

  /**
   * Bulk routes check the content permission for every content type the
   * (non-deleted) entries belong to, and reject the whole request when any is
   * not allowed — nothing is changed. Admin always passes.
   */
  private assertBulkAllowed(user: { role: string; customRole?: string }, ids: number[], action: 'update' | 'publish' | 'delete') {
    return this.permissionsService.assertCanEntries(user, ids, action);
  }

  /** Changing what's live (publish, staging, archive) needs publish; draft / review need update. */
  private static actionFor(status: string): 'update' | 'publish' {
    return status === 'published' || status === 'staging' || status === 'archived' ? 'publish' : 'update';
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-delete')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk soft-delete entries' })
  async bulkDelete(@Body() dto: BulkActionDto, @Request() req: any) {
    await this.assertBulkAllowed(req.user, dto.ids, 'delete');
    return this.entriesService.bulkDelete(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-publish')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk publish entries' })
  async bulkPublish(@Body() dto: BulkActionDto, @Request() req: any) {
    await this.assertBulkAllowed(req.user, dto.ids, 'publish');
    return this.entriesService.bulkPublish(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-archive')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk archive entries' })
  async bulkArchive(@Body() dto: BulkActionDto, @Request() req: any) {
    await this.assertBulkAllowed(req.user, dto.ids, 'publish');
    return this.entriesService.bulkArchive(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-pending-review')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk set entries to pending_review — contributors can submit work for approval' })
  async bulkPendingReview(@Body() dto: BulkActionDto, @Request() req: any) {
    await this.assertBulkAllowed(req.user, dto.ids, 'update');
    return this.entriesService.bulkSetPendingReview(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-stage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk promote entries to staging environment' })
  async bulkStage(@Body() dto: BulkActionDto, @Request() req: any) {
    await this.assertBulkAllowed(req.user, dto.ids, 'publish');
    return this.entriesService.bulkStage(dto.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-promote')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Bulk promote entries to a target environment stage' })
  async bulkPromote(@Body() dto: { ids: number[]; status: EntryStatus }, @Request() req: any) {
    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array of numbers');
    }
    if (!dto.status) throw new BadRequestException('status is required');
    await this.assertBulkAllowed(req.user, dto.ids, EntriesController.actionFor(dto.status));
    return this.entriesService.bulkPromote(dto.ids, dto.status, req.user?.id);
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
    @Request() req?: any,
  ) {
    const fields = populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : [];
    return this.entriesService.findOne(id, fields, req?.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/translate')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create or get a translation entry for a given locale' })
  @ApiParam({ name: 'id', type: Number })
  async createTranslation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { targetLocale: string; copyData?: boolean },
    @Request() req: any,
  ) {
    await this.permissionsService.assertCanEntries(req.user, [id], 'create');
    const result = await this.entriesService.createTranslation(
      id,
      body.targetLocale,
      body.copyData ?? true,
      req.user,
    );
    if (result.isNew) {
      await this.auditService.log(
        { id: req.user.id, email: req.user.email, ip: req.ip },
        'created', 'entry', `entry:${result.id}`,
        { action: 'translate', sourceId: id, locale: result.locale },
      );
    }
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update an entry — auto-snapshots a version before saving (needs update, and publish to publish it)' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntryDto,
    @Request() req: any,
  ) {
    if (req.user.role !== 'admin') {
      const entry = await this.entriesService.findOne(id);
      const ctName = (entry as any).contentType?.name || '*';
      const allowed = await this.permissionsService.can(permissionRole(req.user), ctName, 'update');
      if (!allowed) throw new ForbiddenException('You do not have permission to update entries of this content type');
      if (dto.status === 'published' && entry.status !== 'published') {
        const canPublish = await this.permissionsService.can(permissionRole(req.user), ctName, 'publish');
        if (!canPublish) throw new ForbiddenException('You do not have permission to publish entries of this content type');
      }
    }
    const entry = await this.entriesService.update(id, dto, req.user.id, req.user);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'entry', entry.slug,
      { status: entry.status },
    );
    return entry;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Soft-delete an entry (moves to trash)' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const entry = await this.entriesService.findOne(id);
    const contentTypeName = (entry as any).contentType?.name;
    if (req.user.role !== 'admin' && contentTypeName) {
      const allowed = await this.permissionsService.can(permissionRole(req.user), contentTypeName, 'delete');
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
  @Post(':id/restore')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Restore a trashed entry' })
  @ApiParam({ name: 'id', type: Number })
  async restore(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.permissionsService.assertCanEntries(req.user, [id], 'delete', { includeDeleted: true });
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
  @Post(':id/preview-url')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Generate a 1-hour signed preview token for a draft entry',
    description:
      'Returns a `token` and `expiresAt`. Pass the token as `?token=<token>` to ' +
      '`GET /api/:type/:slug/preview` to read the entry regardless of its publish status.',
  })
  @ApiParam({ name: 'id', type: Number })
  async generatePreviewUrl(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.permissionsService.assertCanEntries(req.user, [id], 'update');
    return this.entriesService.generatePreviewToken(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/promote')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Promote an entry across workflow/environment stages (draft -> pending_review -> staging -> published)' })
  @ApiParam({ name: 'id', type: Number })
  async promote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { status: any },
    @Request() req: any,
  ) {
    if (!dto.status) throw new BadRequestException('status is required');
    await this.permissionsService.assertCanEntries(req.user, [id], EntriesController.actionFor(dto.status));
    const updated = await this.entriesService.promote(id, dto.status, req.user?.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'entry', updated.slug,
      { targetStatus: dto.status },
    );
    return updated;
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
    await this.permissionsService.assertCanEntries(req.user, [id], 'update');
    const entry = await this.entriesService.restoreVersion(id, versionId, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'entry', entry.slug,
      { restoredFromVersion: versionId },
    );
    return entry;
  }
}
