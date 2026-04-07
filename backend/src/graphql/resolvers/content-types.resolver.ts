import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { ContentTypeService } from '../../content-type/content-type.service';
import { ContentTypeModel } from '../models/content-type.model';

@Resolver(() => ContentTypeModel)
export class ContentTypesResolver {
  constructor(private readonly contentTypeService: ContentTypeService) {}

  @Query(() => [ContentTypeModel], { name: 'contentTypes' })
  findAll() {
    return this.contentTypeService.findAll();
  }

  @Query(() => ContentTypeModel, { name: 'contentType', nullable: true })
  async findOne(@Args('id', { type: () => Int }) id: number) {
    try {
      return await this.contentTypeService.findOne(id);
    } catch {
      return null;
    }
  }
}
