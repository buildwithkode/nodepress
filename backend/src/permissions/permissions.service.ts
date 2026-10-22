import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { DEFAULT_PERMISSIONS, isBuiltInRole } from '../roles/roles.constants';

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

  /** Reset all permissions to defaults. */
  async resetAll() {
    await this.prisma.permission.deleteMany({});
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "permissions" ("role", "contentType", "actions") VALUES
        ('editor',      '*', ARRAY['create','read','update','delete','publish']),
        ('contributor', '*', ARRAY['create','read','update']),
        ('viewer',      '*', ARRAY['read'])
    `);
    return { message: 'All permissions reset to defaults' };
  }
}
