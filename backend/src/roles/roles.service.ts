import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import {
  BUILT_IN_ROLES, BaseRole, BuiltInRole, DEFAULT_PERMISSIONS, EffectiveRole,
  isBaseRole, isBuiltInRole, normalizeRoleName,
} from './roles.constants';

const CACHE_PREFIX = 'roles:def:';
const CACHE_TTL_MS = 60_000;
/** AccessService's cache — a role's access follows its base role. */
const ACCESS_CACHE_PREFIX = 'access:';
const NAME_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

const BUILT_IN_INFO: Record<BuiltInRole, { label: string; description: string }> = {
  admin:       { label: 'Admin',       description: 'Full access, including users, settings and API keys' },
  editor:      { label: 'Editor',      description: 'Creates, edits, publishes and deletes content' },
  contributor: { label: 'Contributor', description: 'Creates and edits content; cannot publish' },
  viewer:      { label: 'Viewer',      description: 'Read-only access to the admin' },
};

/** Same actions, ignoring order and duplicates. */
function sameActions(a: string[], b: string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

export interface RoleView {
  name: string;
  label: string;
  description: string | null;
  baseRole: string;
  builtIn: boolean;
  userCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Custom roles: a named role (users.role = name) that inherits the admin-area
 * access of a built-in base role (editor/contributor/viewer) and has its own
 * content permission rows. JwtStrategy maps a custom role to its base role, so
 * @Roles() checks keep working; PermissionsService.can() is called with the
 * custom name and falls back to the base role's rows.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  /** Built-ins first (read-only), then custom roles by name. */
  async findAll(): Promise<RoleView[]> {
    const [custom, counts] = await Promise.all([
      this.prisma.role.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    const countOf = (name: string) => counts.find((c) => c.role === name)?._count._all ?? 0;

    return [
      ...BUILT_IN_ROLES.map((name) => ({
        name,
        ...BUILT_IN_INFO[name],
        baseRole: name,
        builtIn: true,
        userCount: countOf(name),
      })),
      ...custom.map((r) => ({
        name: r.name,
        label: r.label,
        description: r.description,
        baseRole: r.baseRole,
        builtIn: false,
        userCount: countOf(r.name),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    ];
  }

  async create(dto: CreateRoleDto) {
    const name = normalizeRoleName(dto.name);
    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException('Role name must start with a letter and contain only letters, numbers and underscores');
    }
    if (isBuiltInRole(name)) throw new ConflictException(`"${name}" is a built-in role`);
    if (!isBaseRole(dto.baseRole)) throw new BadRequestException('baseRole must be editor, contributor or viewer');

    const exists = await this.prisma.role.findUnique({ where: { name } });
    if (exists) throw new ConflictException(`Role "${name}" already exists`);

    // The new role starts with exactly its base role's default access on every type.
    const [role] = await this.prisma.$transaction([
      this.prisma.role.create({
        data: { name, label: dto.label.trim(), description: dto.description?.trim() || null, baseRole: dto.baseRole },
      }),
      this.prisma.permission.upsert({
        where: { role_contentType: { role: name, contentType: '*' } },
        create: { role: name, contentType: '*', actions: DEFAULT_PERMISSIONS[dto.baseRole] },
        update: { actions: DEFAULT_PERMISSIONS[dto.baseRole] },
      }),
    ]);
    await this.cache.del(CACHE_PREFIX + name);
    await this.cache.invalidatePrefix(ACCESS_CACHE_PREFIX);
    return role;
  }

  /** Label, description and base role are editable; the name is not. */
  async update(rawName: string, dto: UpdateRoleDto) {
    const name = normalizeRoleName(rawName);
    if (isBuiltInRole(name)) throw new BadRequestException('Built-in roles cannot be changed');
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (!existing) throw new NotFoundException(`Role "${name}" not found`);
    if (dto.baseRole !== undefined && !isBaseRole(dto.baseRole)) {
      throw new BadRequestException('baseRole must be editor, contributor or viewer');
    }

    const updateRole = this.prisma.role.update({
      where: { name },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.baseRole !== undefined && { baseRole: dto.baseRole }),
      },
    });

    // A new base role brings its defaults along — unless the admin has
    // customised the role's wildcard row, which is kept (with a warning).
    const warnings: string[] = [];
    let reseed: BaseRole | null = null;
    if (dto.baseRole !== undefined && dto.baseRole !== existing.baseRole) {
      const row = await this.prisma.permission.findUnique({
        where: { role_contentType: { role: name, contentType: '*' } },
      });
      const oldDefaults = DEFAULT_PERMISSIONS[isBaseRole(existing.baseRole) ? existing.baseRole : 'viewer'];
      if (!row || sameActions(row.actions, oldDefaults)) {
        reseed = dto.baseRole as BaseRole; // validated above
      } else {
        warnings.push(
          `The role's default permissions were customised, so they were kept — they were not changed to the ${dto.baseRole} defaults.`,
        );
      }
    }

    let role;
    if (reseed) {
      const actions = DEFAULT_PERMISSIONS[reseed];
      [role] = await this.prisma.$transaction([
        updateRole,
        this.prisma.permission.upsert({
          where: { role_contentType: { role: name, contentType: '*' } },
          create: { role: name, contentType: '*', actions },
          update: { actions },
        }),
      ]);
    } else {
      role = await updateRole;
    }
    await this.cache.del(CACHE_PREFIX + name);
    await this.cache.invalidatePrefix(ACCESS_CACHE_PREFIX);
    return { role, previous: existing, warnings };
  }

  /** 409 while any user still has the role; its permission and access rows go with it. */
  async remove(rawName: string) {
    const name = normalizeRoleName(rawName);
    if (isBuiltInRole(name)) throw new BadRequestException('Built-in roles cannot be deleted');
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (!existing) throw new NotFoundException(`Role "${name}" not found`);

    const userCount = await this.prisma.user.count({ where: { role: name } });
    if (userCount > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `Role "${name}" is still assigned to ${userCount} user${userCount === 1 ? '' : 's'}`,
        userCount,
      });
    }

    await this.prisma.$transaction([
      this.prisma.permission.deleteMany({ where: { role: name } }),
      this.prisma.roleAccess.deleteMany({ where: { role: name } }),
      this.prisma.role.delete({ where: { name } }),
    ]);
    await this.cache.del(CACHE_PREFIX + name);
    await this.cache.invalidatePrefix(ACCESS_CACHE_PREFIX);
    return { message: `Role "${name}" deleted` };
  }

  /** True for a built-in role or an existing custom role. */
  async exists(name: string): Promise<boolean> {
    if (isBuiltInRole(name)) return true;
    return (await this.lookupBaseRole(name)) !== null;
  }

  /**
   * The base role of a custom role, or null when no such role exists.
   * Cached briefly (negative results too) — this runs on every authenticated request.
   */
  async lookupBaseRole(name: string): Promise<BaseRole | null> {
    const key = CACHE_PREFIX + name;
    const cached = await this.cache.get<{ baseRole: string | null }>(key);
    if (cached) return isBaseRole(cached.baseRole) ? cached.baseRole : null;

    const row = await this.prisma.role.findUnique({ where: { name }, select: { baseRole: true } });
    const baseRole = row && isBaseRole(row.baseRole) ? row.baseRole : null;
    await this.cache.set(key, { baseRole }, CACHE_TTL_MS);
    return baseRole;
  }

  /**
   * Map a stored users.role to what the request runs as. A custom role runs as
   * its base role; a role that no longer exists runs as viewer.
   */
  async resolve(stored: string): Promise<EffectiveRole> {
    if (isBuiltInRole(stored)) return { role: stored };
    const baseRole = await this.lookupBaseRole(stored);
    return { role: baseRole ?? 'viewer', customRole: stored };
  }
}
