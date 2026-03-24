import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';

/**
 * Role-based access control guard.
 *
 * Reads the required roles from @Roles() metadata and compares against
 * req.user.role (set by JwtAuthGuard → JwtStrategy.validate()).
 *
 * Must always run AFTER JwtAuthGuard so req.user is populated.
 * If no @Roles() is set on the route, access is granted to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No @Roles() decorator — any authenticated user is allowed
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Authentication required');

    if (!required.includes(user.role as UserRole)) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${required.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
