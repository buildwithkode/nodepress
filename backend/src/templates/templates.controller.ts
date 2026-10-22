import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { TemplatesService } from './templates.service';

class ApplyTemplateDto {
  @IsOptional()
  @IsBoolean()
  sampleContent?: boolean;
}

@ApiTags('Templates')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService, private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Starter templates (admin)' })
  list() {
    return this.templates.list();
  }

  @Post(':id/apply')
  @ApiOperation({ summary: 'Create a template\'s content types and (by default) its sample entries' })
  async apply(@Param('id') id: string, @Body() dto: ApplyTemplateDto, @Request() req: any) {
    const result = await this.templates.apply(id, req.user.id, { sampleContent: dto.sampleContent });
    await this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, 'installed', 'content_type', id, result);
    return result;
  }
}
