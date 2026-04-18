import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

/**
 * JwtAuthGuard adapted for GraphQL execution contexts.
 *
 * The standard JwtAuthGuard (extends AuthGuard('jwt')) uses
 * context.switchToHttp().getRequest() which returns undefined in a GraphQL
 * context. This guard overrides getRequest() to extract the Express request
 * from the Apollo GQL context instead.
 *
 * Usage: replace @UseGuards(JwtAuthGuard) with @UseGuards(GqlJwtAuthGuard)
 * in GraphQL resolvers.
 */
@Injectable()
export class GqlJwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }
}
