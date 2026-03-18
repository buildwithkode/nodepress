import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from './api-keys.service';
import { Request } from 'express';

/** Metadata key used by @RequireAccess() */
export const REQUIRE_ACCESS_KEY = 'require_access';

/** Attach to a route to declare which access level is needed */
export const RequireAccess = (level: 'read' | 'write') =>
  (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(REQUIRE_ACCESS_KEY, level, descriptor ? descriptor.value : target);
    return descriptor ?? target;
  };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = req.headers['x-api-key'];
    const key: string | undefined = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) throw new UnauthorizedException('Missing X-API-Key header');

    const apiKey = await this.apiKeysService.validate(key);
    if (!apiKey) throw new UnauthorizedException('Invalid API key');

    const perms = apiKey.permissions as { access: string; contentTypes: string[] };

    // Check access level required by the route
    const required = this.reflector.get<'read' | 'write'>(REQUIRE_ACCESS_KEY, context.getHandler());
    if (required === 'write' && perms.access === 'read') {
      throw new ForbiddenException('This API key is read-only');
    }

    // Check content type restriction
    const type: string | undefined = (req.params as Record<string, string>)?.type;
    if (type && perms.contentTypes[0] !== '*' && !perms.contentTypes.includes(type)) {
      throw new ForbiddenException(`This API key does not have access to content type "${type}"`);
    }

    // Attach key metadata to request for downstream use
    (req as any).apiKey = apiKey;
    return true;
  }
}
