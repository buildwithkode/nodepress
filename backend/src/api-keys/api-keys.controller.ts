import {
  Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key (admin only)' })
  @ApiResponse({ status: 201, description: 'API key created — copy the key now, it is shown in full only once' })
  async create(@Body() dto: CreateApiKeyDto, @Request() req: any) {
    const key = await this.apiKeysService.create(dto);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'created', 'api_key', key.name,
      { access: dto.permissions?.access },
    );
    return key;
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys (admin only)' })
  @ApiResponse({ status: 200, description: 'Array of API keys' })
  findAll() {
    return this.apiKeysService.findAll();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const result = await this.apiKeysService.remove(id);
    await this.auditService.log(
      { id: req.user.id, email: req.user.email, ip: req.ip },
      'deleted', 'api_key', String(id),
    );
    return result;
  }
}
