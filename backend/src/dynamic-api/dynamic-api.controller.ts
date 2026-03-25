import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, BadRequestException, UseGuards, UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse,
  ApiBearerAuth, ApiParam, ApiBody, ApiHeader, ApiQuery,
} from '@nestjs/swagger';
import { DynamicApiService } from './dynamic-api.service';
import { JwtOrApiKeyGuard } from '../api-keys/jwt-or-api-key.guard';
import { TimeoutInterceptor } from '../common/timeout.interceptor';

@ApiTags('Dynamic API')
@Controller()
export class DynamicApiController {
  constructor(private readonly dynamicApiService: DynamicApiService) {}

  @Get(':type')
  @UseInterceptors(new TimeoutInterceptor(10_000))
  @ApiOperation({
    summary: 'List published entries for a content type (public)',
    description:
      'Returns only `published` entries. Supports pagination, sorting, and field filtering.\n\n' +
      '**Sorting:** `?sort=createdAt:desc` · `?sort=slug:asc` · `?sort=updatedAt:asc`\n\n' +
      '**Filtering:** `?filter[category]=tech` · `?filter[author]=john` (partial match on any data field)\n\n' +
      '**Pagination:** `?page=2&limit=10` (max 100 per page)',
  })
  @ApiParam({ name: 'type', example: 'blog', description: 'Content type name' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'sort', required: false, example: 'createdAt:desc', description: 'field:direction' })
  @ApiQuery({ name: 'filter', required: false, description: 'filter[fieldName]=value — partial match on data field' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Full-text search on slug and all data fields' })
  @ApiResponse({ status: 200, description: '{ data: Entry[], meta: { total, page, limit, totalPages } }' })
  @ApiResponse({ status: 404, description: 'Content type not found or method disabled' })
  findAll(
    @Param('type') type: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: Record<string, string>,
    @Query('search') search?: string,
  ) {
    return this.dynamicApiService.findAll(type, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sort,
      filter: filter && typeof filter === 'object' ? filter : undefined,
      search: search?.trim() || undefined,
    });
  }

  @Get(':type/:slug')
  @UseInterceptors(new TimeoutInterceptor(10_000))
  @ApiOperation({ summary: 'Get a single published entry by slug (public)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  @ApiResponse({ status: 200, description: 'Entry found' })
  @ApiResponse({ status: 404, description: 'Entry not found or not published' })
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
  @ApiOperation({ summary: 'Soft-delete an entry (JWT or write/all API key required)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  remove(@Param('type') type: string, @Param('slug') slug: string) {
    return this.dynamicApiService.remove(type, slug);
  }
}
