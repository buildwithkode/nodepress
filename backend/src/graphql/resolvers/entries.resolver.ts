import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { EntriesService } from '../../entries/entries.service';
import { EntryModel, EntryPage, BulkResult, DeleteResult } from '../models/entry.model';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GqlJwtOptionalGuard } from '../guards/gql-jwt-optional.guard';
import { GqlJwtAuthGuard } from '../guards/gql-jwt-auth.guard';

@Resolver(() => EntryModel)
export class EntriesResolver {
  constructor(private readonly entriesService: EntriesService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => EntryPage, { name: 'entries', description: 'List entries. Authenticated: all statuses. Public: published only.' })
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
    }).then((result) => ({ ...result.meta, data: result.data }));
  }

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => EntryModel, { name: 'entry', nullable: true, description: 'Fetch a single entry by ID.' })
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

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => EntryModel, { name: 'createEntry', description: 'Create a new entry. Requires editor or admin role.' })
  createEntry(
    @Args('contentTypeId', { type: () => Int }) contentTypeId: number,
    @Args('slug') slug: string,
    @Args('locale', { nullable: true, defaultValue: 'en' }) locale: string,
    @Args('status', { nullable: true, defaultValue: 'draft' }) status: string,
    @Args('data', { type: () => String, description: 'JSON string of entry field values' }) dataJson: string,
    @Context() ctx: any,
  ) {
    return this.entriesService.create(
      { contentTypeId, slug, locale, status: status as any, data: JSON.parse(dataJson) },
      ctx.req?.user?.id,
    );
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => EntryModel, { name: 'updateEntry', description: 'Update an existing entry.' })
  updateEntry(
    @Args('id', { type: () => Int }) id: number,
    @Args('data', { type: () => String, nullable: true, description: 'JSON string of updated field values' }) dataJson?: string,
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

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => DeleteResult, { name: 'deleteEntry', description: 'Soft-delete an entry (recoverable). Requires editor or admin.' })
  deleteEntry(@Args('id', { type: () => Int }) id: number) {
    return this.entriesService.remove(id);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => DeleteResult, { name: 'purgeEntry', description: 'Permanently delete a soft-deleted entry. Admin only.' })
  purgeEntry(@Args('id', { type: () => Int }) id: number) {
    return this.entriesService.purge(id);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => EntryModel, { name: 'restoreEntry', description: 'Restore a soft-deleted entry.' })
  restoreEntry(@Args('id', { type: () => Int }) id: number) {
    return this.entriesService.restore(id);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => EntryModel, { name: 'restoreEntryVersion', description: 'Restore an entry to a previous version.' })
  restoreVersion(
    @Args('entryId', { type: () => Int }) entryId: number,
    @Args('versionId', { type: () => Int }) versionId: number,
    @Context() ctx?: any,
  ) {
    return this.entriesService.restoreVersion(entryId, versionId, ctx?.req?.user?.id);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkDeleteEntries', description: 'Soft-delete multiple entries.' })
  bulkDelete(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkDelete(ids);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkPublishEntries', description: 'Publish multiple entries.' })
  bulkPublish(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkPublish(ids);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Mutation(() => BulkResult, { name: 'bulkArchiveEntries', description: 'Archive multiple entries.' })
  bulkArchive(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkArchive(ids);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor', 'contributor')
  @Mutation(() => BulkResult, { name: 'bulkSetPendingReviewEntries', description: 'Set multiple entries to pending_review.' })
  bulkSetPendingReview(@Args('ids', { type: () => [Int] }) ids: number[]) {
    return this.entriesService.bulkSetPendingReview(ids);
  }
}
