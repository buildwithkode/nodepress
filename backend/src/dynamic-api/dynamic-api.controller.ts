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
  @ApiQuery({ name: 'locale', required: false, type: String, description: 'Filter by locale (e.g. en, fr, de). Default: all locales.' })
  @ApiQuery({ name: 'populate', required: false, type: String, description: 'Comma-separated relation field names to populate inline' })
  @ApiResponse({ status: 200, description: '{ data: Entry[], meta: { total, page, limit, totalPages } }' })
  @ApiResponse({ status: 404, description: 'Content type not found or method disabled' })
  findAll(
    @Param('type') type: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: Record<string, string>,
    @Query('search') search?: string,
    @Query('locale') locale?: string,
    @Query('populate') populate?: string,
  ) {
    return this.dynamicApiService.findAll(type, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sort,
      filter: filter && typeof filter === 'object' ? filter : undefined,
      search: search?.trim() || undefined,
      locale: locale?.trim() || undefined,
      populate: populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    });
  }

  @Get(':type/:slug')
  @UseInterceptors(new TimeoutInterceptor(10_000))
  @ApiOperation({ summary: 'Get a single published entry by slug (public)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  @ApiQuery({ name: 'locale', required: false, type: String, description: 'Locale of the entry to fetch. Default: en.' })
  @ApiQuery({ name: 'populate', required: false, type: String, description: 'Comma-separated relation field names to populate inline' })
  @ApiResponse({ status: 200, description: 'Entry found' })
  @ApiResponse({ status: 404, description: 'Entry not found or not published' })
  findOne(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('populate') populate?: string,
  ) {
    return this.dynamicApiService.findOne(type, slug, {
      locale: locale?.trim() || undefined,
      populate: populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    });
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
    @Body('locale') locale?: string,
  ) {
    if (!slug) throw new BadRequestException('slug is required');
    if (!data) throw new BadRequestException('data is required');
    return this.dynamicApiService.create(type, slug, data, locale?.trim() || 'en');
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
    @Body('locale') locale?: string,
  ) {
    if (!data) throw new BadRequestException('data is required');
    return this.dynamicApiService.update(type, slug, data, locale?.trim() || 'en');
  }

  @UseGuards(JwtOrApiKeyGuard)
  @Delete(':type/:slug')
  @ApiBearerAuth('JWT')
  @ApiHeader({ name: 'X-API-Key', description: 'Write API key (alternative to JWT)', required: false })
  @ApiOperation({ summary: 'Soft-delete an entry (JWT or write/all API key required)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  remove(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    return this.dynamicApiService.remove(type, slug, locale?.trim() || 'en');
  }
}
