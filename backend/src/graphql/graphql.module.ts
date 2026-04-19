import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { GraphQLError } from 'graphql';
import GraphQLJSON from 'graphql-type-json';

/** Simple query depth limiter — rejects queries nested deeper than maxDepth. */
function depthLimit(maxDepth: number) {
  return (context: any) => ({
    Field(_node: any, _key: any, _parent: any, _path: any, ancestors: readonly any[]) {
      const depth = ancestors.filter((a: any) => a?.kind === 'Field').length;
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(`Query depth of ${depth} exceeds maximum allowed depth of ${maxDepth}.`),
        );
      }
    },
  });
}
import { EntriesResolver } from './resolvers/entries.resolver';
import { ContentTypesResolver } from './resolvers/content-types.resolver';
import { MediaResolver } from './resolvers/media.resolver';
import { WebhooksResolver } from './resolvers/webhooks.resolver';
import { GqlJwtOptionalGuard } from './guards/gql-jwt-optional.guard';
import { GqlJwtAuthGuard } from './guards/gql-jwt-auth.guard';
import { EntriesModule } from '../entries/entries.module';
import { ContentTypeModule } from '../content-type/content-type.module';
import { MediaModule } from '../media/media.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first: auto-generate schema from decorators
      autoSchemaFile: join(process.cwd(), 'src/graphql/schema.gql'),
      sortSchema: true,
      // Path is relative to the Express root, NOT to the NestJS global prefix.
      // Global prefix 'api' is applied to NestJS controllers only, not Apollo middleware.
      // Using '/graphql' here makes Apollo register at '/graphql' (Express-level),
      // while DynamicApiController's /:type wildcard (at /api/:type) cannot shadow it.
      path: '/graphql',
      resolvers: { JSON: GraphQLJSON },
      // Pass HTTP request into GraphQL context for auth guards
      context: ({ req }: { req: any }) => ({ req }),
      introspection: true,
      playground: true,
      // Prevent deeply nested queries from overloading the server.
      // Depth 6 allows: query { entries { data { ... } } } comfortably.
      validationRules: [depthLimit(6)],
    }),
    EntriesModule,
    ContentTypeModule,
    MediaModule,
    WebhooksModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  providers: [
    EntriesResolver,
    ContentTypesResolver,
    MediaResolver,
    WebhooksResolver,
    GqlJwtOptionalGuard,
    GqlJwtAuthGuard,
  ],
})
export class GraphqlModule {}
