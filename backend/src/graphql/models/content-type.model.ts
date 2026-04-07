import { ObjectType, Field, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class ContentTypeModel {
  @Field(() => Int) id: number;
  @Field()          name: string;
  @Field(() => GraphQLJSON) schema: any;
  @Field(() => GraphQLJSON, { nullable: true }) allowedMethods: any;
  @Field()          createdAt: Date;
  @Field()          updatedAt: Date;
}
