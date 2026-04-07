import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class MediaModel {
  @Field(() => Int)            id: number;
  @Field()                     filename: string;
  @Field()                     url: string;
  @Field()                     originalName: string;
  @Field()                     mimetype: string;
  @Field(() => Int)            size: number;
  @Field({ nullable: true })   webpUrl?: string;
  @Field(() => Int, { nullable: true }) width?: number;
  @Field(() => Int, { nullable: true }) height?: number;
  @Field(() => Int, { nullable: true }) uploadedBy?: number;
  @Field()                     createdAt: Date;
}

@ObjectType()
export class MediaPage {
  @Field(() => [MediaModel]) data: MediaModel[];
  @Field(() => Int)          total: number;
  @Field(() => Int)          page: number;
  @Field(() => Int)          limit: number;
  @Field(() => Int)          totalPages: number;
}
