import { Body, Controller, Get, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { FullAccessKeyOrJwtGuard } from '../api-keys/full-access-key-or-jwt.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { SiteTransferService } from './site-transfer.service';

const flag = (v: unknown) => v === true || v === 'true' || v === '1';

/**
 * Whole-site export / import (admin, or an API key with "all" access to every
 * content type — the CLI's `site:export` / `site:import`). Import bodies may be
 * larger than the global 1 MB JSON limit: see `siteImportBodyParser` in main.ts.
 */
@ApiTags('Site export / import')
@Controller('site')
@UseGuards(FullAccessKeyOrJwtGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
@ApiHeader({ name: 'X-API-Key', required: false, description: 'Alternative to JWT: a key with "all" access to every content type' })
export class SiteTransferController {
  constructor(
    private readonly service: SiteTransferService,
    private readonly audit: AuditService,
  ) {}

  @Get('export')
  @SkipThrottle()
  @ApiOperation({ summary: 'Export choice lists, components, content types, every entry, forms, webhooks and redirects as one JSON file' })
  async export(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const bundle = await this.service.export({ admin: !!req.user });
    const stamp = bundle.exportedAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    res.setHeader('Content-Disposition', `attachment; filename="nodepress-site-${stamp}.json"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await this.audit.log(this.actor(req), 'exported', 'import', 'Site export (content model and entries)');
    return bundle;
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a site export. ?dryRun=true previews; ?overwrite=false keeps existing types, entries, forms, webhooks and redirects' })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiQuery({ name: 'overwrite', required: false, type: Boolean })
  async import(
    @Body() bundle: any,
    @Query('dryRun') dryRun: string | undefined,
    @Query('overwrite') overwrite: string | undefined,
    @Request() req: any,
  ) {
    const result: any = await this.service.import(
      bundle,
      { dryRun: flag(dryRun), overwrite: overwrite === undefined ? true : flag(overwrite), admin: !!req.user },
      req.user?.id,
    );
    if (!result.dryRun) {
      const e = result.entries;
      await this.audit.log(this.actor(req), 'created', 'import', `Site import: ${e.created} entries created, ${e.updated} updated; ${result.forms.created} forms, ${result.webhooks.created} webhooks and ${result.redirects.created} redirects created`);
    }
    return result;
  }

  private actor(req: any) {
    return req.user
      ? { id: req.user.id, email: req.user.email, ip: req.ip }
      : { email: `api-key:${req.apiKey?.name ?? 'unknown'}`, ip: req.ip };
  }
}
