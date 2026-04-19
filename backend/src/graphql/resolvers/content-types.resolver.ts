import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ContentTypeService } from '../../content-type/content-type.service';
import { ContentTypeModel } from '../models/content-type.model';
import { DeleteResult } from '../models/entry.model';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GqlJwtAuthGuard } from '../guards/gql-jwt-auth.guard';

@Resolver(() => ContentTypeModel)
export class ContentTypesResolver {
  constructor(private readonly contentTypeService: ContentTypeService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────────

  @Query(() => [ContentTypeModel], { name: 'contentTypes', description: 'List all content types.' })
  findAll() {
    return this.contentTypeService.findAll();
  }

  @Query(() => ContentTypeModel, { name: 'contentType', nullable: true, description: 'Fetch a single content type by ID.' })
  async findOne(@Args('id', { type: () => Int }) id: number) {
    try {
      return await this.contentTypeService.findOne(id);
    } catch {
      return null;
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => ContentTypeModel, { name: 'createContentType', description: 'Create a new content type. Admin only.' })
  createContentType(
    @Args('name') name: string,
    @Args('schema', { type: () => String, description: 'JSON array of field definitions' }) schemaJson: string,
    @Args('allowedMethods', { type: () => [String], nullable: true, description: 'Restrict allowed API methods' }) allowedMethods?: string[],
  ) {
    return this.contentTypeService.create({
      name,
      schema: JSON.parse(schemaJson),
      allowedMethods,
    });
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => ContentTypeModel, { name: 'updateContentType', description: 'Update a content type schema or name. Admin only.' })
  updateContentType(
    @Args('id', { type: () => Int }) id: number,
    @Args('name', { nullable: true }) name?: string,
    @Args('schema', { type: () => String, nullable: true, description: 'JSON array of field definitions' }) schemaJson?: string,
    @Args('allowedMethods', { type: () => [String], nullable: true }) allowedMethods?: string[],
    @Context() ctx?: any,
  ) {
    return this.contentTypeService.update(
      id,
      {
        name,
        schema: schemaJson ? JSON.parse(schemaJson) : undefined,
        allowedMethods,
      },
      ctx?.req?.user?.id,
    );
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => ContentTypeModel, { name: 'deleteContentType', description: 'Delete a content type and all its entries. Admin only.' })
  deleteContentType(@Args('id', { type: () => Int }) id: number) {
    return this.contentTypeService.remove(id);
  }
}
