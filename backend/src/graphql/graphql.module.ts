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
import { PermissionsModule } from '../permissions/permissions.module';
import { ContentTypeModule } from '../content-type/content-type.module';
import { MediaModule } from '../media/media.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { JwtModule } from '@nestjs/jwt';
import { ContentGraphqlService } from './content-graphql.service';

/** Provides the typed-content gateway to GraphQLModule's options factory. */
@Module({ providers: [ContentGraphqlService], exports: [ContentGraphqlService] })
export class ContentGraphqlModule {}

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ContentGraphqlModule],
      inject: [ContentGraphqlService],
      useFactory: (content: ContentGraphqlService) => ({
        // Code-first: auto-generate schema from decorators. Development writes it
        // to src/graphql/schema.gql for reference; production keeps it in memory
        // (the working directory may be the data folder — see server.js).
        autoSchemaFile: process.env.NODE_ENV === 'production' ? true : join(process.cwd(), 'src/graphql/schema.gql'),
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
        // Prevent deeply nested queries from overloading the server. Depth 8 allows
        // blogPosts { data { data { author { data { company { data { name } } } } } } }.
        validationRules: [depthLimit(8)],
        // The code-first schema plus one typed query pair per content type,
        // swapped in by ContentGraphqlService when content types change.
        transformSchema: content.captureBase,
        gateway: content.gateway as any,
      }),
    }),
    EntriesModule,
    PermissionsModule,
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
