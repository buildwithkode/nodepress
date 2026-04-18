import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Extends NestJS ThrottlerGuard to support GraphQL execution contexts.
 *
 * The default ThrottlerGuard uses context.switchToHttp() to retrieve req/res.
 * For GraphQL requests, this returns undefined, causing "Cannot read property 'ip'
 * of undefined". This guard detects GraphQL contexts and extracts the underlying
 * Express request from the Apollo context instead.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const contextType = context.getType<string>();

    if (contextType === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const req = gqlCtx.getContext().req;
      const res = req?.res;
      return { req, res };
    }

    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
