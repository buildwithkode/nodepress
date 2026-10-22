import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';
import { RolesService } from '../roles/roles.service';
import { PermissionsService } from '../permissions/permissions.service';
import { Request } from 'express';

/**
 * Allows through if the request carries EITHER:
 *   - A valid JWT Bearer token, OR
 *   - A valid X-API-Key header with "write" or "all" access
 *
 * A JWT user (other than admin) must also hold the content permission for the
 * write (create/update/delete, plus publish for a published create) on :type.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly apiKeysService: ApiKeysService,
    private readonly roles: RolesService,
    private readonly permissions: PermissionsService,
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

    let user: any;
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT');
    }
    if (!user) throw new UnauthorizedException('User not found');

    const { role, customRole } = await this.roles.resolve(user.role);
    (req as any).user = { ...user, role, customRole };
    await this.assertContentPermission(req, role, customRole);
    return true;
  }

  private async assertContentPermission(req: Request, role: string, customRole?: string) {
    const type = (req.params as Record<string, string>)?.type;
    if (role === 'admin' || !type) return;
    const action = req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : req.method === 'DELETE' ? 'delete' : null;
    if (!action) return;

    const ctName = type.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const permRole = customRole ?? role;
    if (!(await this.permissions.can(permRole, ctName, action))) {
      throw new ForbiddenException(`You do not have permission to ${action} entries of "${ctName}"`);
    }
    // The public create defaults to published
    const status = (req.body as any)?.status ?? 'published';
    if (action === 'create' && status === 'published' && !(await this.permissions.can(permRole, ctName, 'publish'))) {
      throw new ForbiddenException(`You do not have permission to publish entries of "${ctName}"`);
    }
  }
}
