import {
  Controller, Get, Post, Put, Delete,
  Param, Body, BadRequestException, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiBody, ApiHeader,
} from '@nestjs/swagger';
import { DynamicApiService } from './dynamic-api.service';
import { JwtOrApiKeyGuard } from '../api-keys/jwt-or-api-key.guard';

@ApiTags('Dynamic API')
@Controller()
export class DynamicApiController {
  constructor(private readonly dynamicApiService: DynamicApiService) {}

  @Get(':type')
  @ApiOperation({ summary: 'List all entries for a content type (public)' })
  @ApiParam({ name: 'type', example: 'blog', description: 'Content type name' })
  @ApiResponse({ status: 200, description: 'Array of entries' })
  @ApiResponse({ status: 404, description: 'Content type not found' })
  findAll(@Param('type') type: string) {
    return this.dynamicApiService.findAll(type);
  }

  @Get(':type/:slug')
  @ApiOperation({ summary: 'Get a single entry by slug (public)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  @ApiResponse({ status: 200, description: 'Entry found' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  findOne(@Param('type') type: string, @Param('slug') slug: string) {
    return this.dynamicApiService.findOne(type, slug);
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Post(':type')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', description: 'Write API key (alternative to JWT)', required: false })
  @ApiOperation({ summary: 'Create an entry (JWT or write/all API key required)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiBody({
    schema: {
      example: {
        slug: 'my-first-post',
        data: { title: 'My Post', content: 'Hello world' },
      },
    },
  })
  create(
    @Param('type') type: string,
    @Body('slug') slug: string,
    @Body('data') data: Record<string, any>,
  ) {
    if (!slug) throw new BadRequestException('slug is required');
    if (!data) throw new BadRequestException('data is required');
    return this.dynamicApiService.create(type, slug, data);
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Put(':type/:slug')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', description: 'Write API key (alternative to JWT)', required: false })
  @ApiOperation({ summary: 'Update an entry (JWT or write/all API key required)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  @ApiBody({ schema: { example: { data: { title: 'Updated Title' } } } })
  update(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Body('data') data: Record<string, any>,
  ) {
    if (!data) throw new BadRequestException('data is required');
    return this.dynamicApiService.update(type, slug, data);
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Delete(':type/:slug')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', description: 'Write API key (alternative to JWT)', required: false })
  @ApiOperation({ summary: 'Delete an entry (JWT or write/all API key required)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  remove(@Param('type') type: string, @Param('slug') slug: string) {
    return this.dynamicApiService.remove(type, slug);
  }
}
