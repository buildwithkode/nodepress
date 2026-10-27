import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { PluginRegistry } from '../plugin/plugin.registry';
import { RolesService } from './roles.service';
import { BASE_ROLES, BaseRole, DEFAULT_PERMISSIONS, isBaseRole, isBuiltInRole } from './roles.constants';
import {
  AccessLevel, AccessModuleDef, CORE_MODULES, contentLevel, isAccessLevel, levelAllows,
} from './access-modules';

const CACHE_PREFIX = 'access:';
const CACHE_TTL_MS = 60_000;

/** What a role can do: a level per module, and its content actions per type ('*' = every other type). */
export interface RoleAccessView {
  modules: Record<string, AccessLevel>;
  content: Record<string, string[]>;
}

type AccessUser = { role: string; customRole?: string };

/**
 * Module access per role (see access-modules.ts). Saved levels live in
 * role_access; a module with no row gets the role's base-role default. The
 * `content` level is derived from the content permission rows, so the
 * Permissions page and the per-type checks in PermissionsService stay the one
 * source for content.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly roles: RolesService,
    @Optional() private readonly plugins?: PluginRegistry,
  ) {}

  /** Core modules, then those contributed by enabled plugins (manifest `adminModules`). */
  modules(): AccessModuleDef[] {
    const fromPlugins = (this.plugins?.getEnabled() ?? []).flatMap((p) =>
      (p.manifest.adminModules ?? []).map((m) => ({
        key: m.key,
        label: m.label,
        description: m.description ?? '',
        defaults: Object.fromEntries(BASE_ROLES.map((r) => [r, m.defaults?.[r] ?? 'none'])) as AccessModuleDef['defaults'],
        plugin: p.manifest.id,
      })),
    );
    const core = new Set(CORE_MODULES.map((m) => m.key));
    return [...CORE_MODULES, ...fromPlugins.filter((m) => !core.has(m.key))];
  }

  /** Whether the user's role has at least `need` on `module`. Admin always does. */
  async allows(user: AccessUser, module: string, need: AccessLevel): Promise<boolean> {
    if (user.role === 'admin') return true;
    const { modules } = await this.forRole(user.customRole ?? user.role);
    return levelAllows(modules[module] ?? 'none', need);
  }

  /** The signed-in user's access, for the admin UI (sidebar, buttons). */
  async forUser(user: AccessUser): Promise<RoleAccessView> {
    if (user.role === 'admin') {
      return {
        modules: Object.fromEntries(this.modules().map((m) => [m.key, 'edit' as AccessLevel])),
        content: { '*': DEFAULT_PERMISSIONS.admin },
      };
    }
    return this.forRole(user.customRole ?? user.role);
  }

  /** Effective access of a stored role name (built-in or custom). Cached briefly. */
  async forRole(role: string): Promise<RoleAccessView> {
    const key = CACHE_PREFIX + role;
    const cached = await this.cache.get<RoleAccessView>(key);
    if (cached) return this.withPluginDefaults(cached, await this.baseOf(role));

    const base = await this.baseOf(role);
    const [rows, content] = await Promise.all([
      this.prisma.roleAccess.findMany({ where: { role } }),
      this.contentFor(role, base),
    ]);
    const modules: Record<string, AccessLevel> = {};
    for (const m of CORE_MODULES) modules[m.key] = m.defaults[base];
    for (const r of rows) if (isAccessLevel(r.level)) modules[r.module] = r.level as AccessLevel;
    modules.content = contentLevel(content['*'] ?? []);

    const view = { modules, content };
    await this.cache.set(key, view, CACHE_TTL_MS);
    return this.withPluginDefaults(view, base);
  }

  /** Every non-admin role with its access — the admin's Module access page. */
  async matrix(): Promise<{ modules: AccessModuleDef[]; roles: Array<{ name: string; access: RoleAccessView }> }> {
    const custom = await this.prisma.role.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    const names = [...BASE_ROLES, ...custom.map((r) => r.name)];
    const roles = await Promise.all(names.map(async (name) => ({ name, access: await this.forRole(name) })));
    return { modules: this.modules(), roles };
  }

  /** Save levels for some modules of a role. `content` is set through the permission rows instead. */
  async set(role: string, levels: Record<string, unknown>) {
    if (role === 'admin') throw new NotFoundException('Admin always has full access');
    if (!(await this.roles.exists(role))) throw new NotFoundException(`Role "${role}" not found`);
    const known = new Set(this.modules().map((m) => m.key));
    const entries = Object.entries(levels ?? {});
    for (const [module, level] of entries) {
      if (module === 'content') throw new BadRequestException('Set content access through /permissions');
      if (!known.has(module)) throw new BadRequestException(`Unknown module "${module}"`);
      if (!isAccessLevel(level)) throw new BadRequestException(`Level for "${module}" must be none, view or edit`);
    }
    await this.prisma.$transaction(entries.map(([module, level]) =>
      this.prisma.roleAccess.upsert({
        where: { role_module: { role, module } },
        create: { role, module, level: level as string },
        update: { level: level as string },
      }),
    ));
    await this.invalidate();
    return this.forRole(role);
  }

  /** Back to every role's defaults. */
  async resetAll() {
    await this.prisma.roleAccess.deleteMany({});
    await this.invalidate();
  }

  /** Drop cached access — after any role, permission or access write (custom roles inherit from base roles). */
  invalidate() {
    return this.cache.invalidatePrefix(CACHE_PREFIX);
  }

  private async baseOf(role: string): Promise<BaseRole> {
    if (isBaseRole(role)) return role;
    if (isBuiltInRole(role)) return 'editor'; // admin never gets here through allows()
    return (await this.roles.lookupBaseRole(role)) ?? 'viewer';
  }

  /** Plugin modules aren't cached (plugins can be turned on/off); fill in their default when there's no row. */
  private async withPluginDefaults(view: RoleAccessView, base: BaseRole): Promise<RoleAccessView> {
    const extra = this.modules().filter((m) => m.plugin && !(m.key in view.modules));
    if (!extra.length) return view;
    return { ...view, modules: { ...view.modules, ...Object.fromEntries(extra.map((m) => [m.key, m.defaults[base]])) } };
  }

  /**
   * Content actions per type, resolved the way PermissionsService.can() does:
   * own row for the type, own '*', then (custom roles) the base role's rows, then defaults.
   */
  private async contentFor(role: string, base: BaseRole): Promise<Record<string, string[]>> {
    const rows = await this.prisma.permission.findMany({ where: { role: { in: [role, base] } } });
    const own = new Map(rows.filter((r) => r.role === role).map((r) => [r.contentType, r.actions]));
    const inherited = new Map(rows.filter((r) => r.role === base && base !== role).map((r) => [r.contentType, r.actions]));
    const resolve = (type: string) =>
      own.get(type) ?? own.get('*') ?? inherited.get(type) ?? inherited.get('*') ?? DEFAULT_PERMISSIONS[base];
    const types = new Set(['*', ...own.keys(), ...inherited.keys()]);
    return Object.fromEntries([...types].map((t) => [t, resolve(t)]));
  }
}
