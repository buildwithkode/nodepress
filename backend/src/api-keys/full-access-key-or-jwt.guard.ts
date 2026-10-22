import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * For site-wide admin routes that CI tooling needs (schema export/import, used
 * by `nodepress schema:pull/diff/push`). Lets through EITHER:
 *   - an X-API-Key with access "all" on every content type (contentTypes ["*"]), OR
 *   - a JWT whose role passes the route's @Roles() — JwtAuthGuard + RolesGuard.
 *
 * Narrower keys get 403: a key scoped to some types, or read/write only, must
 * not be able to reshape the whole content model.
 */
@Injectable()
export class FullAccessKeyOrJwtGuard implements CanActivate {
  private readonly jwt = new JwtAuthGuard();
  private readonly roles: RolesGuard;

  constructor(private readonly apiKeysService: ApiKeysService, reflector: Reflector) {
    this.roles = new RolesGuard(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = req.headers['x-api-key'];
    const keyHeader: string | undefined = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (keyHeader) {
      const apiKey = await this.apiKeysService.validate(keyHeader);
      if (!apiKey) throw new UnauthorizedException('Invalid API key');
      const perms = (apiKey.permissions ?? {}) as { access?: string; contentTypes?: string[] };
      if (perms.access !== 'all' || !Array.isArray(perms.contentTypes) || !perms.contentTypes.includes('*')) {
        throw new ForbiddenException('This route needs an API key with "all" access to every content type');
      }
      (req as any).apiKey = apiKey;
      return true;
    }

    if (!(await (this.jwt.canActivate(context) as Promise<boolean>))) return false;
    return this.roles.canActivate(context);
  }
}
