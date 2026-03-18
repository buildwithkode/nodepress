import {
  Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key (admin only)' })
  @ApiResponse({ status: 201, description: 'API key created — copy the key now, it is shown in full only once' })
  create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(dto);
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
  @ApiResponse({ status: 200, description: 'Key revoked' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.apiKeysService.remove(id);
  }
}
