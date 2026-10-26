import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard for GraphQL — populates ctx.req.user (through
 * JwtStrategy, so with the user's role) if a valid Bearer access token is
 * present, but never throws for missing/invalid tokens.
 * Lets resolvers serve public data while enabling authenticated views.
 */
@Injectable()
export class GqlJwtOptionalGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    return GqlExecutionContext.create(context).getContext().req;
  }

  handleRequest(_err: unknown, user: any) {
    return user || undefined;
  }
}
