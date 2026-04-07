import { ObjectType, Field, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class WebhookModel {
  @Field(() => Int)  id: number;
  @Field()           name: string;
  @Field()           url: string;
  @Field(() => GraphQLJSON) events: string[];
  @Field()           enabled: boolean;
  @Field()           createdAt: Date;
  @Field()           updatedAt: Date;
}

@ObjectType()
export class WebhookDeliveryModel {
  @Field(() => Int)            id: number;
  @Field(() => Int)            webhookId: number;
  @Field()                     event: string;
  @Field(() => GraphQLJSON)    payload: any;
  @Field()                     status: string;
  @Field(() => Int)            attempts: number;
  @Field(() => Int, { nullable: true }) responseStatus?: number;
  @Field({ nullable: true })   errorMessage?: string;
  @Field()                     createdAt: Date;
}
