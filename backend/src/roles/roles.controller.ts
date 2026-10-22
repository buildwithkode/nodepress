import {
  Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List built-in (read-only) and custom roles with user counts (admin only)' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom role based on editor, contributor or viewer (admin only)' })
  @ApiResponse({ status: 409, description: 'Name clashes with a built-in or existing role' })
  async create(@Body() dto: CreateRoleDto, @Request() req: any) {
    const role = await this.rolesService.create(dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'role', role.name,
      { label: role.label, baseRole: role.baseRole },
    );
    return role;
  }

  @Put(':name')
  @ApiOperation({ summary: 'Update a custom role\'s label, description or base role — the name is immutable (admin only)' })
  @ApiParam({ name: 'name', type: String })
  async update(@Param('name') name: string, @Body() dto: UpdateRoleDto, @Request() req: any) {
    const { role, previous } = await this.rolesService.update(name, dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'role', role.name,
      {
        label: role.label,
        baseRole: role.baseRole,
        ...(previous.baseRole !== role.baseRole && { previousBaseRole: previous.baseRole }),
      },
    );
    return role;
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Delete a custom role (admin only) — 409 while users still have it' })
  @ApiParam({ name: 'name', type: String })
  @ApiResponse({ status: 409, description: 'Role is still assigned to users (body has userCount)' })
  async remove(@Param('name') name: string, @Request() req: any) {
    const result = await this.rolesService.remove(name);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'role', name,
    );
    return result;
  }
}
