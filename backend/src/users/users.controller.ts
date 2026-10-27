import {
  Controller, Get, Post, Put, Delete,
  Body, Param, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @UseGuards(RolesGuard)
  @Access('users', 'edit')
  @Post()
  @ApiOperation({ summary: 'Invite a user (Users: edit; only admins can give the admin role)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async create(@Body() dto: CreateUserDto, @Request() req: any) {
    const user = await this.usersService.create(dto, req.user.email, req.user.role);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'user', String(user.id),
      { email: user.email, role: user.role },
    );
    return user;
  }

  @UseGuards(RolesGuard)
  @Access('users', 'view')
  @Get()
  @ApiOperation({ summary: 'List all users (Users: view)' })
  @ApiResponse({ status: 200, description: 'Array of users (no passwords)' })
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(RolesGuard)
  @Access('users', 'edit')
  @Put(':id/role')
  @ApiOperation({ summary: 'Change a user\'s role (Users: edit; only admins change admins)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Role updated' })
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Request() req: any,
  ) {
    const user = await this.usersService.updateRole(id, dto, req.user.id, req.user.role);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'role_changed', 'user', String(id),
      { newRole: dto.role },
    );
    return user;
  }

  @UseGuards(RolesGuard)
  @Access('users', 'edit')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (Users: edit — not yourself, the last admin, or an admin unless you are one)' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const result = await this.usersService.remove(id, req.user.id, req.user.role);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'user', String(id),
    );
    return result;
  }

  @UseGuards(RolesGuard)
  @Access('users', 'edit')
  @Post(':id/invite')
  @ApiOperation({ summary: 'Send a "Set Your Password" invitation email to a user (Users: edit)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 201, description: 'Invitation sent (no-op if SMTP not configured)' })
  async sendInvitation(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const result = await this.usersService.sendInvitation(id, req.user.email, req.user.role);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'invited', 'user', String(id),
    );
    return result;
  }

  // ─── Self-service ──────────────────────────────────────────────────────────

  @Put('me/password')
  @ApiOperation({ summary: 'Change your own password' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Current password incorrect' })
  async changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    const result = await this.usersService.changePassword(req.user.id, dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'password_changed', 'user', String(req.user.id),
    );
    return result;
  }
}
