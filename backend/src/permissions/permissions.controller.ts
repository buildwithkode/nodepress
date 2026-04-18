import {
  Controller, Get, Put, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { UpsertPermissionDto } from './dto/upsert-permission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all permission rows (admin only)' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':role')
  @ApiOperation({ summary: 'Get permissions for a specific role (admin only)' })
  @ApiParam({ name: 'role', type: String })
  findByRole(@Param('role') role: string) {
    return this.permissionsService.findByRole(role);
  }

  @Put('reset/all')
  @ApiOperation({ summary: 'Reset all permissions to factory defaults (admin only)' })
  resetAll() {
    return this.permissionsService.resetAll();
  }

  @Put(':role/:contentType')
  @ApiOperation({ summary: 'Set allowed actions for a role on a content type (admin only). Use * for all.' })
  @ApiParam({ name: 'role', type: String })
  @ApiParam({ name: 'contentType', type: String, description: 'Content type name or * for wildcard' })
  upsert(
    @Param('role') role: string,
    @Param('contentType') contentType: string,
    @Body() dto: UpsertPermissionDto,
  ) {
    return this.permissionsService.upsert(role, contentType, dto.actions);
  }

  @Delete(':role/:contentType')
  @ApiOperation({ summary: 'Remove a permission override — role falls back to wildcard (admin only)' })
  @ApiParam({ name: 'role', type: String })
  @ApiParam({ name: 'contentType', type: String })
  remove(@Param('role') role: string, @Param('contentType') contentType: string) {
    return this.permissionsService.remove(role, contentType);
  }
}
