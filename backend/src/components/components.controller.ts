import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ComponentsService } from './components.service';
import { CreateComponentDto, UpdateComponentDto } from './dto/component.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('Components')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('components')
export class ComponentsController {
  constructor(
    private readonly components: ComponentsService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Read routes — any signed-in admin panel user ─────────────────────────

  @Get()
  @ApiOperation({ summary: 'List reusable components with the content type fields that use them' })
  findAll() {
    return this.components.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one component and its usage' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.components.findOne(id);
  }

  // ─── Write routes — admin only ─────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post()
  @ApiOperation({ summary: 'Create a component (admin only)' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  async create(@Body() dto: CreateComponentDto, @Request() req: any) {
    const component = await this.components.create(dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'component', component.name,
    );
    return component;
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Put(':id')
  @ApiOperation({ summary: 'Update a component and every content type that uses it (admin only)' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComponentDto,
    @Request() req: any,
  ) {
    const component = await this.components.update(id, dto, req.user.id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'component', component.name,
      { updatedContentTypes: component.updatedContentTypes.map((c) => c.name) },
    );
    return component;
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a component (admin only) — 409 while a content type uses it' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 409, description: 'Component is in use' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const component = await this.components.remove(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'component', component.name,
    );
    return component;
  }
}
