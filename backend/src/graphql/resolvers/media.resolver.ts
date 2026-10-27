import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MediaService } from '../../media/media.service';
import { MediaModel, MediaPage } from '../models/media.model';
import { DeleteResult } from '../models/entry.model';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Access } from '../../auth/decorators/access.decorator';

@Resolver(() => MediaModel)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'view')
  @Query(() => MediaPage, { name: 'mediaFiles', description: 'List all uploaded media files (authenticated)' })
  findAll(
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ) {
    return this.mediaService.findAll(page, limit).then((result) => ({
      ...result.meta,
      data: result.data,
    }));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Mutation(() => DeleteResult, { name: 'deleteMedia', description: 'Delete a media file by filename (admin/editor only)' })
  async deleteMedia(
    @Args('filename') filename: string,
  ) {
    return this.mediaService.remove(filename);
  }
}
