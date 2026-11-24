import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { AccessService } from '../roles/access.service';
import { DEFAULT_PERMISSIONS, isBaseRole, isBuiltInRole } from '../roles/roles.constants';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    @Optional() private readonly access?: AccessService,
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

  /** assertCanTypes for the content types of these entries (non-deleted unless `includeDeleted`). */
  async assertCanEntries(
    user: { role: string; customRole?: string }, ids: number[], action: string, opts: { includeDeleted?: boolean } = {},
  ) {
    if (user.role === 'admin' || !Array.isArray(ids) || ids.length === 0) return;
    const rows = await this.prisma.entry.findMany({
      where: { id: { in: ids }, ...(!opts.includeDeleted && { deletedAt: null }) },
      select: { contentType: { select: { name: true } } },
    });
    await this.assertCanTypes(user, rows.map((r) => r.contentType?.name).filter((n): n is string => !!n), action);
  }

  /**
   * The content types whose entries this user may `action` — null for an admin
   * (every type). Used to narrow the admin entry list, counts and `?populate=`
   * to what the role may read. Same rules as `can()`, in two queries.
   */
  async allowedContentTypes(
    user: { role: string; customRole?: string }, action: string,
  ): Promise<{ id: number; name: string }[] | null> {
    if (user.role === 'admin') return null;
    const types = await this.prisma.contentType.findMany({ select: { id: true, name: true } });
    const allowed = await this.allowedNames(user.customRole ?? user.role, types.map((t) => t.name), action);
    return types.filter((t) => allowed.has(t.name));
  }

  /**
   * The `?populate=` paths whose every relation points at a content type the
   * user may read. The others are dropped, so those values stay plain ids
   * instead of showing entries (drafts included) the role can't open.
   */
  async readablePopulate(user: { role: string; customRole?: string } | undefined, entryId: number, paths: string[]): Promise<string[]> {
    if (!paths.length || !user) return paths;
    const readable = await this.allowedContentTypes(user, 'read');
    if (!readable) return paths;
    const allowed = new Set(readable.map((t) => t.name));
    const [entry, types] = await Promise.all([
      this.prisma.entry.findUnique({ where: { id: entryId }, select: { contentType: { select: { schema: true } } } }),
      this.prisma.contentType.findMany({ select: { name: true, schema: true } }),
    ]);
    const schemas = new Map(types.map((t) => [t.name, t.schema as any[]]));
    const ok = (path: string) => {
      let schema = entry?.contentType?.schema as any[] | undefined;
      for (const segment of path.split('.')) {
        const field = Array.isArray(schema) ? schema.find((f) => f?.name === segment && f?.type === 'relation') : undefined;
        const target = field?.options?.relatedContentType;
        if (!target) return true; // not a relation: populate leaves it alone
        if (!allowed.has(target)) return false;
        schema = schemas.get(target);
      }
      return true;
    };
    return paths.filter(ok);
  }

  /** `can()` for many content types at once. */
  private async allowedNames(role: string, types: string[], action: string): Promise<Set<string>> {
    if (role === 'admin') return new Set(types);
    const rows = await this.prisma.permission.findMany({ where: { role } });
    const byType = new Map(rows.map((r) => [r.contentType, r.actions]));
    const wildcard = byType.get('*');
    const allowed = new Set<string>();
    const undecided: string[] = [];
    for (const type of types) {
      const actions = byType.get(type) ?? wildcard;
      if (!actions) undecided.push(type);
      else if (actions.includes(action)) allowed.add(type);
    }
    if (undecided.length) {
      if (!isBuiltInRole(role)) {
        const { role: baseRole } = await this.roles.resolve(role);
        for (const type of await this.allowedNames(baseRole, undecided, action)) allowed.add(type);
      } else if (DEFAULT_PERMISSIONS[role]?.includes(action)) {
        for (const type of undecided) allowed.add(type);
      }
    }
    return allowed;
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
    const row = await this.prisma.permission.upsert({
      where: { role_contentType: { role, contentType } },
      create: { role, contentType, actions },
      update: { actions },
    });
    await this.access?.invalidate();
    return row;
  }

  /** Remove a specific (role, contentType) override — the role falls back to its wildcard. */
  async remove(role: string, contentType: string) {
    await this.prisma.permission.deleteMany({ where: { role, contentType } });
    await this.access?.invalidate();
    return { message: `Permission for ${role}/${contentType} reset to default` };
  }

  /**
   * Reset all permissions and module access to defaults. Custom roles get their
   * ('<name>', '*') row back with their base role's defaults — the same row role
   * creation writes.
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
      this.prisma.roleAccess.deleteMany({}),
    ]);
    await this.access?.invalidate();
    return { message: 'All permissions reset to defaults' };
  }
}
