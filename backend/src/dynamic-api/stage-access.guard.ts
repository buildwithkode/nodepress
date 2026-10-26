import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { keyCoversType } from '../common/content-type-name';
import { isAccessTokenPayload } from '../auth/access-token';

/** The stage a public read targets: ?stage= wins, then the environment header. */
export function requestedStage(req: Request): string {
  const q = req.query?.stage;
  const stage = Array.isArray(q) ? q[0] : q;
  if (typeof stage === 'string' && stage) return stage;
  return req.headers['x-nodepress-environment'] === 'staging' ? 'staging' : 'published';
}

/**
 * Public read routes (GET /:type, /:type/:slug) serve published content to
 * anyone. Any other stage (`?stage=draft|staging|all`, or the
 * `x-nodepress-environment: staging` header) exposes unpublished entries, so it
 * needs credentials: a valid JWT (any role) or an API key — any access level —
 * that covers the content type.
 *
 * Such responses are marked `Cache-Control: private, no-store` so no CDN or
 * shared cache keeps unpublished content.
 */
@Injectable()
export class StageAccessGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (requestedStage(req) === 'published') return true;

    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'private, no-store');

    const rawKey = req.headers['x-api-key'];
    const keyHeader = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (keyHeader) {
      const apiKey = await this.apiKeysService.validate(keyHeader);
      if (!apiKey) throw new UnauthorizedException('Invalid API key');
      const perms = apiKey.permissions as { access: string; contentTypes: string[] };
      const type = (req.params as Record<string, string>)?.type;
      if (type && !keyCoversType(perms.contentTypes, type)) {
        throw new ForbiddenException(`This API key does not have access to content type "${type}"`);
      }
      (req as any).apiKey = apiKey;
      return true;
    }

    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException('Reading unpublished content needs a JWT or an X-API-Key');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: process.env.JWT_SECRET });
      if (!isAccessTokenPayload(payload)) throw new Error('not an access token');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new Error('user not found');
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }
  }
}
