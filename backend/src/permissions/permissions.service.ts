import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { DEFAULT_PERMISSIONS, isBaseRole, isBuiltInRole } from '../roles/roles.constants';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  /** Get all permission rows — used by admin UI. */
  async findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ role: 'asc' }, { contentType: 'asc' }] });
  }

  /** Get all permissions for a specific role. */
  async findByRole(role: string) {
    return this.prisma.permission.findMany({
      where: { role },
      orderBy: { contentType: 'asc' },
    });
  }

  /**
   * Check if a role can perform an action on a given content type.
   * - Admin always passes.
   * - Looks for a specific (role, contentType) match first, then falls back to (role, '*').
   * - Falls back to hardcoded defaults if no DB row found.
   * - A custom role with no matching row falls back to its base role (rows, then
   *   defaults); a custom role that no longer exists falls back to viewer.
   *
   * Callers pass `req.user.customRole ?? req.user.role`.
   */
  /**
   * Throw 403 unless the signed-in user may `action` entries of every given
   * content type (admins always may). Shared by the REST and GraphQL entry routes.
   */
  async assertCanTypes(user: { role: string; customRole?: string }, types: string[], action: string) {
    if (user.role === 'admin') return;
    const forbidden: string[] = [];
    for (const type of [...new Set(types)]) {
      if (!(await this.can(user.customRole ?? user.role, type, action))) forbidden.push(type);
    }
    if (forbidden.length) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: `You do not have permission to ${action} entries of: ${forbidden.join(', ')}`,
        forbiddenContentTypes: forbidden,
      });
    }
  }

  /** assertCanTypes for the content types of these (non-deleted) entries. */
  async assertCanEntries(user: { role: string; customRole?: string }, ids: number[], action: string) {
    if (user.role === 'admin' || !Array.isArray(ids) || ids.length === 0) return;
    const rows = await this.prisma.entry.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { contentType: { select: { name: true } } },
    });
    await this.assertCanTypes(user, rows.map((r) => r.contentType?.name).filter((n): n is string => !!n), action);
  }

  /** assertCanTypes for a content type given by id. */
  async assertCanContentType(user: { role: string; customRole?: string }, contentTypeId: number, action: string) {
    if (user.role === 'admin') return;
    const ct = await this.prisma.contentType.findUnique({ where: { id: contentTypeId }, select: { name: true } });
    if (ct) await this.assertCanTypes(user, [ct.name], action);
  }

  async can(role: string, contentType: string, action: string): Promise<boolean> {
    if (role === 'admin') return true;

    const rows = await this.prisma.permission.findMany({
      where: { role, contentType: { in: [contentType, '*'] } },
    });

    const specific = rows.find((r) => r.contentType === contentType);
    const wildcard = rows.find((r) => r.contentType === '*');
    const perm = specific ?? wildcard;

    if (perm) return perm.actions.includes(action);

    if (!isBuiltInRole(role)) {
      const { role: baseRole } = await this.roles.resolve(role);
      return this.can(baseRole, contentType, action);
    }

    // Fallback to hardcoded defaults
    return DEFAULT_PERMISSIONS[role]?.includes(action) ?? false;
  }

  /** Permission rows only make sense for non-admin built-ins and existing custom roles. */
  async assertAssignable(role: string) {
    if (role === 'admin') throw new NotFoundException('Admin always has full access; it has no permission rows');
    if (!(await this.roles.exists(role))) throw new NotFoundException(`Role "${role}" not found`);
  }

  /**
   * Create or update a permission row.
   * An empty actions array effectively removes all access.
   */
  async upsert(role: string, contentType: string, actions: string[]) {
    await this.assertAssignable(role);
    return this.prisma.permission.upsert({
      where: { role_contentType: { role, contentType } },
      create: { role, contentType, actions },
      update: { actions },
    });
  }

  /** Remove a specific (role, contentType) override — the role falls back to its wildcard. */
  async remove(role: string, contentType: string) {
    await this.prisma.permission.deleteMany({ where: { role, contentType } });
    return { message: `Permission for ${role}/${contentType} reset to default` };
  }

  /**
   * Reset all permissions to defaults. Custom roles get their ('<name>', '*')
   * row back with their base role's defaults — the same row role creation writes.
   */
  async resetAll() {
    const customRoles = await this.prisma.role.findMany({ select: { name: true, baseRole: true } });
    const builtIn = (['editor', 'contributor', 'viewer'] as const)
      .map((role) => ({ role, contentType: '*', actions: DEFAULT_PERMISSIONS[role] }));
    const custom = customRoles.map((r) => ({
      role: r.name,
      contentType: '*',
      actions: DEFAULT_PERMISSIONS[isBaseRole(r.baseRole) ? r.baseRole : 'viewer'],
    }));
    await this.prisma.$transaction([
      this.prisma.permission.deleteMany({}),
      this.prisma.permission.createMany({ data: [...builtIn, ...custom] }),
    ]);
    return { message: 'All permissions reset to defaults' };
  }
}
