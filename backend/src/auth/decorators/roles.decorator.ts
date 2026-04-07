import { SetMetadata } from '@nestjs/common';

export type UserRole = 'admin' | 'editor' | 'contributor' | 'viewer';

export const ROLES_KEY = 'roles';

/**
 * Declare which roles are permitted to access a route.
 *
 * Usage:
 *   @Roles('admin')           — admin only
 *   @Roles('admin', 'editor') — admin or editor
 *
 * Must be combined with @UseGuards(JwtAuthGuard, RolesGuard).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
