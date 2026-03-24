import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { ContentTypeService } from './content-type.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

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
    const ct = await this.contentTypeService.update(id, dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'content_type', ct.name,
    );
    return ct;
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
