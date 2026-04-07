import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';

/**
 * Optional JWT guard for GraphQL — populates ctx.req.user if a valid
 * Bearer token is present, but never throws for missing/invalid tokens.
 * Lets resolvers serve public data while enabling authenticated views.
 */
@Injectable()
export class GqlJwtOptionalGuard {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;

    const auth = req?.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        req.user = this.jwtService.verify(auth.slice(7));
      } catch {
        // invalid token — treat as unauthenticated
      }
    }
    return true;
  }
}
