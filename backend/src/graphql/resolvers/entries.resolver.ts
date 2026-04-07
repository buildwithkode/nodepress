import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { EntriesService } from '../../entries/entries.service';
import { EntryModel, EntryPage, BulkResult, DeleteResult } from '../models/entry.model';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GqlJwtOptionalGuard } from '../guards/gql-jwt-optional.guard';

@Resolver(() => EntryModel)
export class EntriesResolver {
  constructor(private readonly entriesService: EntriesService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => EntryPage, { name: 'entries', description: 'List entries (authenticated: all statuses; public: published only)' })
  findAll(
    @Args('contentTypeId', { type: () => Int, nullable: true }) contentTypeId?: number,
    @Args('status', { nullable: true }) status?: string,
    @Args('locale', { nullable: true }) locale?: string,
    @Args('search', { nullable: true }) search?: string,
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page?: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 20 }) limit?: number,
    @Context() ctx?: any,
  ) {
    const isAuthenticated = !!ctx?.req?.user;
    return this.entriesService.findAll({
      contentTypeId,
      status: isAuthenticated ? status : 'published',
      locale,
      search,
      page,
      limit,
    }).then((result) => ({
      ...result.meta,
      data: result.data,
    }));
  }

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => EntryModel, { name: 'entry', nullable: true })
  async findOne(
    @Args('id', { type: () => Int }) id: number,
    @Args('populate', { type: () => [String], nullable: true }) populate?: string[],
  ) {
    try {
      return await this.entriesService.findOne(id, populate ?? []);
    } catch {
      return null;
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => EntryModel, { name: 'createEntry' })
  createEntry(
    @Args('contentTypeId', { type: () => Int }) contentTypeId: number,
    @Args('slug') slug: string,
    @Args('locale', { nullable: true, defaultValue: 'en' }) locale: string,
    @Args('status', { nullable: true, defaultValue: 'published' }) status: string,
    @Args('data', { type: () => String, description: 'JSON string of entry data' }) dataJson: string,
    @Context() ctx: any,
  ) {
    return this.entriesService.create(
      { contentTypeId, slug, locale, status: status as any, data: JSON.parse(dataJson) },
      ctx.req?.user?.id,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => EntryModel, { name: 'updateEntry' })
  updateEntry(
    @Args('id', { type: () => Int }) id: number,
    @Args('data', { type: () => String, nullable: true }) dataJson?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('slug', { nullable: true }) slug?: string,
    @Context() ctx?: any,
  ) {
    return this.entriesService.update(
      id,
      { data: dataJson ? JSON.parse(dataJson) : undefined, status: status as any, slug },
      ctx?.req?.user?.id,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => DeleteResult, { name: 'deleteEntry' })
  deleteEntry(@Args('id', { type: () => Int }) id: number) {
    return this.entriesService.remove(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkDeleteEntries' })
  bulkDelete(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkDelete(ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkPublishEntries' })
  bulkPublish(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkPublish(ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkArchiveEntries' })
  bulkArchive(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkArchive(ids);
  }
}
