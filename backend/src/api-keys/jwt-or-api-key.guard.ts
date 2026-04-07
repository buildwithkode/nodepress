import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';
import { Request } from 'express';

/**
 * Allows through if the request carries EITHER:
 *   - A valid JWT Bearer token, OR
 *   - A valid X-API-Key header with "write" or "all" access
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // --- Try API key first ---
    const rawKey = req.headers['x-api-key'];
    const keyHeader: string | undefined = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (keyHeader) {
      const apiKey = await this.apiKeysService.validate(keyHeader);
      if (!apiKey) throw new UnauthorizedException('Invalid API key');

      const perms = apiKey.permissions as { access: string; contentTypes: string[] };
      if (perms.access === 'read') throw new ForbiddenException('This API key is read-only');

      const type: string | undefined = (req.params as Record<string, string>)?.type;
      if (type && perms.contentTypes[0] !== '*' && !perms.contentTypes.includes(type)) {
        throw new ForbiddenException(`This API key does not have access to content type "${type}"`);
      }

      (req as any).apiKey = apiKey;
      return true;
    }

    // --- Fall back to JWT ---
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) throw new UnauthorizedException('No credentials provided (JWT or X-API-Key required)');

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('User not found');
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }
  }
}
