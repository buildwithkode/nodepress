import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards, Request, HttpCode,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiHeader,
} from '@nestjs/swagger';
import { ContentTypeService } from './content-type.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { FullAccessKeyOrJwtGuard } from '../api-keys/full-access-key-or-jwt.guard';

@ApiTags('Content Types')
@Controller('content-types')
export class ContentTypeController {
  constructor(
    private readonly contentTypeService: ContentTypeService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Write routes — admin only ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new content type (admin only)' })
  @ApiResponse({ status: 201, description: 'Content type created' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  async create(@Body() dto: CreateContentTypeDto, @Request() req: any) {
    const ct = await this.contentTypeService.create(dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'content_type', ct.name,
    );
    return ct;
  }

  // ─── Read routes — any authenticated or public ─────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all content types' })
  @ApiResponse({ status: 200, description: 'Array of content types' })
  findAll() {
    return this.contentTypeService.findAll();
  }

  // ─── Schema Export / Import — MUST be before @Get(':id') to avoid route shadowing ─

  @UseGuards(FullAccessKeyOrJwtGuard)
  @Roles('admin', 'editor')
  @Get('export')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', required: false, description: 'Alternative to JWT: a key with "all" access to every content type' })
  @ApiOperation({ summary: 'Export content type schemas as JSON (admin, editor, or a full-access API key)' })
  exportSchemas(@Request() req: any) {
    return this.contentTypeService.exportSchemas();
  }

  @UseGuards(FullAccessKeyOrJwtGuard)
  @Roles('admin')
  @Post('import')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', required: false, description: 'Alternative to JWT: a key with "all" access to every content type' })
  @ApiOperation({ summary: 'Import content type schemas with Dry-Run support (admin, or a full-access API key)' })
  async importSchemas(@Body() dto: any, @Request() req: any) {
    const result = await this.contentTypeService.importSchemas(dto, req.user?.id);
    if (!dto.dryRun) {
      await this.auditService.log(
        req.user
          ? { id: req.user.id, email: req.user.email, ip: req.ip }
          : { email: `api-key:${req.apiKey?.name ?? 'unknown'}`, ip: req.ip },
        'created', 'content_type', `Imported schemas: ${result.created || 0} created, ${result.updated || 0} updated`,
      );
    }
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single content type by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contentTypeService.findOne(id);
  }

  @Get(':id/form')
  @ApiOperation({ summary: 'Get the generated form structure for a content type' })
  @ApiParam({ name: 'id', type: Number })
  getForm(@Param('id', ParseIntPipe) id: number) {
    return this.contentTypeService.getForm(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a content type (admin only)' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContentTypeDto,
    @Request() req: any,
  ) {
    const ct = await this.contentTypeService.update(id, dto, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'content_type', ct.name,
    );
    return ct;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/schema-impact')
  @HttpCode(200)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Preview what a schema update would do to existing entries (admin only)',
    description: 'Takes the same body as PUT /content-types/:id and changes nothing. Returns the field diff, '
      + 'per migration step the entries affected (and values a conversion would remove), and the retyped fields.',
  })
  @ApiParam({ name: 'id', type: Number })
  schemaImpact(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContentTypeDto) {
    return this.contentTypeService.schemaImpact(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get(':id/schema-history')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get schema change history for a content type (admin only)' })
  @ApiParam({ name: 'id', type: Number })
  getSchemaHistory(@Param('id', ParseIntPipe) id: number) {
    return this.contentTypeService.getSchemaHistory(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a content type and all its entries (admin only)' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const ct = await this.contentTypeService.findOne(id);
    const result = await this.contentTypeService.remove(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'content_type', ct.name,
    );
    return result;
  }
}
