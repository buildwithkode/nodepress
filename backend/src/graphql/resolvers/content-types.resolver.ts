import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ContentTypeService } from '../../content-type/content-type.service';
import { ContentTypeModel } from '../models/content-type.model';
import { DeleteResult } from '../models/entry.model';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Access } from '../../auth/decorators/access.decorator';
import { GqlJwtAuthGuard } from '../guards/gql-jwt-auth.guard';
import { GqlJwtOptionalGuard } from '../guards/gql-jwt-optional.guard';
import { isPublicContentType, publicContentType } from '../../content-type/public-view';

@Resolver(() => ContentTypeModel)
export class ContentTypesResolver {
  constructor(private readonly contentTypeService: ContentTypeService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => [ContentTypeModel], { name: 'contentTypes', description: 'List content types. Public: public types and fields only.' })
  async findAll(@Context() ctx?: any) {
    const types = await this.contentTypeService.findAll();
    if (ctx?.req?.user) return types;
    return types.filter((ct) => isPublicContentType(ct)).map(publicContentType);
  }

  @UseGuards(GqlJwtOptionalGuard)
  @Query(() => ContentTypeModel, { name: 'contentType', nullable: true, description: 'Fetch a single content type by ID. Public: public types only.' })
  async findOne(@Args('id', { type: () => Int }) id: number, @Context() ctx?: any) {
    try {
      const ct = await this.contentTypeService.findOne(id);
      if (ctx?.req?.user) return ct;
      return isPublicContentType(ct) ? publicContentType(ct) : null;
    } catch {
      return null;
    }
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Access('content_model', 'edit')
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
  @Access('content_model', 'edit')
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
  @Access('content_model', 'edit')
  @Mutation(() => ContentTypeModel, { name: 'deleteContentType', description: 'Delete a content type and all its entries. Admin only.' })
  deleteContentType(@Args('id', { type: () => Int }) id: number) {
    return this.contentTypeService.remove(id);
  }
}
