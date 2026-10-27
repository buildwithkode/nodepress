import {
  Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Access } from '../auth/decorators/access.decorator';
import { AuditService } from '../audit/audit.service';
import { RolesService } from './roles.service';
import { AccessService } from './access.service';
import { CreateRoleDto, SetAccessDto, UpdateRoleDto } from './dto/role.dto';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
  ) {}

  // Readable with Users → view, so whoever manages users can pick a role.
  @Get()
  @Access('users', 'view')
  @ApiOperation({ summary: 'List built-in (read-only) and custom roles with user counts (Users: view)' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @Roles('admin')
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

  // ─── Module access — declared before ':name' ──────────────────────────────

  @Get('access')
  @Roles('admin')
  @ApiOperation({ summary: 'Modules and each non-admin role\'s access to them (admin only)' })
  accessMatrix() {
    return this.accessService.matrix();
  }

  @Put('access/:name')
  @Roles('admin')
  @ApiOperation({
    summary: 'Set a role\'s access (none / view / edit) to some modules (admin only)',
    description: 'Content access is set through /permissions, per content type.',
  })
  @ApiParam({ name: 'name', type: String })
  async setAccess(@Param('name') name: string, @Body() dto: SetAccessDto, @Request() req: any) {
    const access = await this.accessService.set(name, dto.modules);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'role', name,
      { access: dto.modules },
    );
    return access;
  }

  @Put(':name')
  @Roles('admin')
  @ApiOperation({
    summary: 'Update a custom role\'s label, description or base role — the name is immutable (admin only)',
    description: 'Changing baseRole replaces the role\'s (role, *) permission row with the new base role\'s defaults, '
      + 'unless it was customised — then it is kept and the response\'s `warnings` says so.',
  })
  @ApiParam({ name: 'name', type: String })
  async update(@Param('name') name: string, @Body() dto: UpdateRoleDto, @Request() req: any) {
    const { role, previous, warnings } = await this.rolesService.update(name, dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'updated', 'role', role.name,
      {
        label: role.label,
        baseRole: role.baseRole,
        ...(previous.baseRole !== role.baseRole && { previousBaseRole: previous.baseRole }),
      },
    );
    return { ...role, warnings };
  }

  @Delete(':name')
  @Roles('admin')
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
