import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';
import { ACCESS_KEY } from '../decorators/access.decorator';
import { AccessService } from '../../roles/access.service';
import type { AccessLevel } from '../../roles/access-modules';

/**
 * Role and module-access guard.
 *
 * - @Roles(...) compares against req.user.role (set by JwtAuthGuard → JwtStrategy.validate()).
 * - @Access(module, level) asks AccessService whether the user's role has that
 *   level on the module (Users → Permissions → Module access).
 *
 * Must always run AFTER JwtAuthGuard so req.user is populated.
 * With neither decorator on the route, any authenticated user is allowed.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    const needed = this.reflector.getAllAndOverride<{ module: string; level: AccessLevel }>(ACCESS_KEY, targets);

    if ((!required || required.length === 0) && !needed) return true;

    // Support both HTTP and GraphQL execution contexts
    const request = ctx.getType<string>() === 'graphql'
      ? GqlExecutionContext.create(ctx).getContext().req
      : ctx.switchToHttp().getRequest();
    const { user } = request;
    if (!user) throw new ForbiddenException('Authentication required');

    if (required?.length && !required.includes(user.role as UserRole)) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${required.join(', ')}. Your role: ${user.role}`,
      );
    }

    if (needed && !(await this.access.allows(user, needed.module, needed.level))) {
      throw new ForbiddenException(
        needed.level === 'edit'
          ? `Your role can't make changes in ${needed.module.replace(/_/g, ' ')}`
          : `Your role has no access to ${needed.module.replace(/_/g, ' ')}`,
      );
    }

    return true;
  }
}
