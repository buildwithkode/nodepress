import { SetMetadata } from '@nestjs/common';
import type { AccessLevel } from '../../roles/access-modules';

export const ACCESS_KEY = 'access';

/**
 * Declare the module access a route needs (Users → Permissions → Module access):
 *
 *   @Access('media', 'view')  — reading
 *   @Access('media', 'edit')  — changing
 *
 * Checked by RolesGuard (with JwtAuthGuard first). Admin always passes.
 */
export const Access = (module: string, level: Exclude<AccessLevel, 'none'>) =>
  SetMetadata(ACCESS_KEY, { module, level });
