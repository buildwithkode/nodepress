import {
  Body, Controller, Delete, Get, Header, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, Request, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { AuditService } from '../audit/audit.service';
import { RedirectsService } from './redirects.service';
import { CreateRedirectDto, ImportRedirectsDto, UpdateRedirectDto } from './redirects.dto';

/** Public: what a site's middleware asks for every path it can't serve (or every path). */
@ApiTags('Redirects')
@Controller('redirects')
export class RedirectsPublicController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get('resolve')
  @ApiOperation({ summary: 'Look up a redirect: { to, statusCode } or 404 (410 = gone, to is null)' })
  @ApiQuery({ name: 'path', example: '/old-page' })
  async resolve(@Query('path') path: string, @Res({ passthrough: true }) res: Response) {
    // Short public cache: a CDN or the site's fetch cache absorbs repeat lookups.
    res.setHeader('Cache-Control', 'public, max-age=60');
    const hit = await this.redirects.resolve(path);
    if (!hit) throw new NotFoundException('No redirect for this path');
    return hit;
  }
}

@ApiTags('Redirects')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Access('redirects', 'view')
@Controller('redirects')
export class RedirectsController {
  constructor(
    private readonly redirects: RedirectsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List redirects (?search=, ?page=, ?limit=, ?sort=createdAt|hits|from)' })
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('sort') sort?: string) {
    return this.redirects.list({ page: Number(page), limit: Number(limit), search, sort });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="redirects.csv"')
  @ApiOperation({ summary: 'All redirects as CSV (from,to,status,hits,last_hit_at)' })
  export() {
    return this.redirects.exportCsv();
  }

  @Access('redirects', 'edit')
  @Post('import')
  @ApiOperation({ summary: 'Import from,to,status CSV rows (all or nothing; dryRun only reports)' })
  async import(@Body() dto: ImportRedirectsDto, @Request() req: any) {
    const report = await this.redirects.importCsv(dto.csv, !!dto.dryRun);
    if (report.applied) {
      await this.log(req, 'created', 'import', { created: report.created, updated: report.updated });
    }
    return report;
  }

  @Access('redirects', 'edit')
  @Post()
  @ApiOperation({ summary: 'Create a redirect' })
  async create(@Body() dto: CreateRedirectDto, @Request() req: any) {
    const created = await this.redirects.create(dto);
    await this.log(req, 'created', String(created.id), { from: created.from, to: created.to, statusCode: created.statusCode });
    return created;
  }

  @Access('redirects', 'edit')
  @Patch(':id')
  @ApiOperation({ summary: 'Change a redirect' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRedirectDto, @Request() req: any) {
    const updated = await this.redirects.update(id, dto);
    await this.log(req, 'updated', String(id), { from: updated.from, to: updated.to, statusCode: updated.statusCode });
    return updated;
  }

  @Access('redirects', 'edit')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a redirect' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const res = await this.redirects.remove(id);
    await this.log(req, 'deleted', String(id));
    return res;
  }

  private log(req: any, action: 'created' | 'updated' | 'deleted', id: string, metadata?: Record<string, any>) {
    return this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, action, 'redirect', id, metadata);
  }
}
