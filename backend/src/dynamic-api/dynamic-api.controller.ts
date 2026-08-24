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
import { HttpCacheInterceptor } from '../common/http-cache.interceptor';

@ApiTags('Dynamic API')
@Controller()
export class DynamicApiController {
  constructor(private readonly dynamicApiService: DynamicApiService) {}

  @Get(':type')
  @UseInterceptors(new TimeoutInterceptor(10_000), new HttpCacheInterceptor())
  @ApiOperation({
    summary: 'List published entries for a content type (public)',
    description:
      'Returns only `published` entries. Supports pagination, sorting, advanced operator filtering, and relation population.\n\n' +
      '**Advanced Filtering:** `?where[price][gte]=100` · `?where[category][in]=tech,news` · `?where[title][contains]=guide` · `?filters[price][$gte]=100`\n\n' +
      '**Sorting:** `?sort=createdAt:desc` · `?sort=slug:asc` · `?sort=updatedAt:asc`\n\n' +
      '**Pagination:** `?page=2&limit=10` (max 100 per page)',
  })
  @ApiParam({ name: 'type', example: 'blog', description: 'Content type name' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'sort', required: false, example: 'createdAt:desc', description: 'field:direction' })
  @ApiQuery({ name: 'where', required: false, description: 'where[field][operator]=value — supports eq, ne, gt, gte, lt, lte, in, notIn, contains, startsWith, endsWith, null, notNull' })
  @ApiQuery({ name: 'filters', required: false, description: 'Strapi-compatible alias for where parameter' })
  @ApiQuery({ name: 'filter', required: false, description: 'Legacy filter[fieldName]=value — partial match on data field' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Full-text search on slug and all data fields' })
  @ApiQuery({ name: 'locale', required: false, type: String, description: 'Filter by locale (e.g. en, fr, de). Default: all locales.' })
  @ApiQuery({ name: 'populate', required: false, type: String, description: 'Comma-separated relation field names to populate inline' })
  @ApiQuery({ name: 'fields', required: false, type: String, description: 'Comma-separated data field names to include (projection). Omit for all fields.' })
  @ApiResponse({ status: 200, description: '{ data: Entry[], meta: { total, page, limit, totalPages } }' })
  @ApiResponse({ status: 404, description: 'Content type not found or method disabled' })
  findAll(
    @Param('type') type: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('where') where?: Record<string, any>,
    @Query('filters') filters?: Record<string, any>,
    @Query('filter') filter?: Record<string, string>,
    @Query('search') search?: string,
    @Query('locale') locale?: string,
    @Query('populate') populate?: string,
    @Query('fields') fields?: string,
  ) {
    return this.dynamicApiService.findAll(type, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sort,
      where: where || filters || undefined,
      filter: filter && typeof filter === 'object' ? filter : undefined,
      search: search?.trim() || undefined,
      locale: locale?.trim() || undefined,
      populate: populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
      fields: fields ? fields.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    });
  }

  @Get(':type/:slug')
  @UseInterceptors(new TimeoutInterceptor(10_000), new HttpCacheInterceptor())
  @ApiOperation({ summary: 'Get a single published entry by slug (public)' })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-first-post' })
  @ApiQuery({ name: 'locale', required: false, type: String, description: 'Locale of the entry to fetch. Default: en.' })
  @ApiQuery({ name: 'populate', required: false, type: String, description: 'Comma-separated relation field names to populate inline' })
  @ApiQuery({ name: 'fields', required: false, type: String, description: 'Comma-separated data field names to include (projection). Omit for all fields.' })
  @ApiResponse({ status: 200, description: 'Entry found' })
  @ApiResponse({ status: 404, description: 'Entry not found or not published' })
  findOne(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('populate') populate?: string,
    @Query('fields') fields?: string,
  ) {
    return this.dynamicApiService.findOne(type, slug, {
      locale: locale?.trim() || undefined,
      populate: populate ? populate.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
      fields: fields ? fields.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    });
  }

  @Get(':type/:slug/preview')
  @UseInterceptors(new TimeoutInterceptor(10_000))
  @ApiOperation({
    summary: 'Preview a draft entry by slug (requires signed preview token)',
    description:
      'Returns any entry regardless of publish status. Requires a valid `?token=` generated ' +
      'by `POST /api/entries/:id/preview-url`. Tokens expire after 1 hour. ' +
      'Useful for previewing draft content in a front-end before publishing.',
  })
  @ApiParam({ name: 'type', example: 'blog' })
  @ApiParam({ name: 'slug', example: 'my-draft-post' })
  @ApiQuery({ name: 'token', required: true, type: String, description: 'Signed preview token from POST /api/entries/:id/preview-url' })
  @ApiQuery({ name: 'locale', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Draft entry returned with _preview: true flag' })
  @ApiResponse({ status: 401, description: 'Token invalid or expired' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  findOnePreview(
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Query('locale') locale?: string,
  ) {
    return this.dynamicApiService.findOnePreview(type, slug, token, locale?.trim() || 'en');
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
