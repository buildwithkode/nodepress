import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin:       ['create', 'read', 'update', 'delete', 'publish'],
  editor:      ['create', 'read', 'update', 'delete', 'publish'],
  contributor: ['create', 'read', 'update'],
  viewer:      ['read'],
};

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Fallback to hardcoded defaults
    return DEFAULT_PERMISSIONS[role]?.includes(action) ?? false;
  }

  /**
   * Create or update a permission row.
   * An empty actions array effectively removes all access.
   */
  async upsert(role: string, contentType: string, actions: string[]) {
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
