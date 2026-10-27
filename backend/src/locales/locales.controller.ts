import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { AuditService } from '../audit/audit.service';
import { LocalesService } from './locales.service';

@ApiTags('Locales')
@Controller('locales')
export class LocalesController {
  constructor(
    private readonly locales: LocalesService,
    private readonly audit: AuditService,
  ) {}

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Enabled content languages and the default (public)' })
  get() {
    return this.locales.get();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('languages', 'view')
  @Get('usage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Number of entries per locale' })
  usage() {
    return this.locales.usage();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('languages', 'edit')
  @Put()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set the enabled content languages and the default (admin)' })
  async update(@Body() body: { defaultLocale?: string; locales?: string[] }, @Request() req: any) {
    const config = await this.locales.update(body);
    await this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, 'updated', 'settings', 'locales', config as any);
    return config;
  }
}
