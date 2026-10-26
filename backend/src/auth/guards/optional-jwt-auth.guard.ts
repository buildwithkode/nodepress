import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Lets anonymous requests through with no `req.user`, and authenticates
 * requests that send a Bearer token exactly like JwtAuthGuard (a bad or
 * expired token is still a 401, so the admin's refresh flow kicks in).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers?.authorization) return true;
    return super.canActivate(context);
  }
}
