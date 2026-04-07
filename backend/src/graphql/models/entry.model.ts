import { ObjectType, Field, Int, ID } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class EntryModel {
  @Field(() => Int) id: number;
  @Field(() => ID)  publicId: string;
  @Field()          slug: string;
  @Field()          locale: string;
  @Field()          status: string;
  @Field(() => GraphQLJSON, { nullable: true }) data: any;
  @Field(() => GraphQLJSON, { nullable: true }) seo: any;
  @Field()          createdAt: Date;
  @Field()          updatedAt: Date;
  @Field({ nullable: true }) deletedAt?: Date;
}

@ObjectType()
export class EntryPage {
  @Field(() => [EntryModel]) data: EntryModel[];
  @Field(() => Int)          total: number;
  @Field(() => Int)          page: number;
  @Field(() => Int)          limit: number;
  @Field(() => Int)          totalPages: number;
}

@ObjectType()
export class BulkResult {
  @Field(() => Int) affected: number;
}

@ObjectType()
export class DeleteResult {
  @Field() message: string;
}
