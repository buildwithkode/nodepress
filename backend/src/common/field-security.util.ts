import { ForbiddenException } from '@nestjs/common';
import { FieldDef } from '../fields/field.types';

/**
 * Who a field rule is checked against: a single role name, or a user as
 * JwtStrategy puts it on req.user (`role` = base role, `customRole` = custom
 * role name). A rule matches when it lists the custom role OR the base role.
 * undefined / null = public.
 */
export type FieldAccessRole =
  | string
  | { role?: string | null; customRole?: string | null }
  | null
  | undefined;

/** The role names a field rule may match for `who` (custom role first). */
export function fieldRoleNames(who: FieldAccessRole): string[] {
  if (!who) return [];
  if (typeof who === 'string') return [who];
  return [who.customRole, who.role].filter((r): r is string => typeof r === 'string' && r.length > 0);
}

/** The base role of `who` — what the entry hooks receive as `role`. */
export function baseRoleName(who: FieldAccessRole): string | undefined {
  if (!who) return undefined;
  return typeof who === 'string' ? who : who.role ?? undefined;
}

function matchesAny(allowed: string[], names: string[]): boolean {
  return names.some((n) => allowed.includes(n));
}

/**
 * Filter out fields from entry data that the user's role is not authorized to read.
 *
 * @param data - Raw entry data payload
 * @param schema - Content type FieldDef[] schema
 * @param role - User's role ('admin', 'editor', …), a `{ role, customRole }` user, or undefined for public
 * @returns Cleaned data object with unauthorized read fields removed
 */
export function filterUnauthorizedReadFields(
  data: Record<string, any> | undefined | null,
  schema: FieldDef[],
  role?: FieldAccessRole,
): Record<string, any> {
  if (!data || typeof data !== 'object') return data || {};
  const names = fieldRoleNames(role);
  if (names.includes('admin')) return data; // Admin has universal access

  const sanitized: Record<string, any> = { ...data };

  for (const field of schema) {
    if (!field || !field.name) continue;

    const readRoles: string[] = (field as any).readRoles || (field as any).options?.readRoles;
    if (Array.isArray(readRoles) && readRoles.length > 0) {
      if (!matchesAny(readRoles, names)) {
        delete sanitized[field.name];
      }
    }
  }

  return sanitized;
}

/**
 * Validate that incoming mutation data does not modify fields the user's role is not allowed to write.
 *
 * @param incomingData - Incoming data from request payload
 * @param currentData - Existing data in DB (for updates) or undefined (for creates)
 * @param schema - Content type FieldDef[] schema
 * @param role - User's role, or a `{ role, customRole }` user
 * @throws ForbiddenException if unauthorized field mutation is attempted
 */
export function validateFieldWritePermissions(
  incomingData: Record<string, any> | undefined | null,
  currentData: Record<string, any> | undefined | null,
  schema: FieldDef[],
  role?: FieldAccessRole,
): void {
  if (!incomingData || typeof incomingData !== 'object') return;
  const names = fieldRoleNames(role);
  if (names.includes('admin')) return; // Admin has universal write access

  for (const field of schema) {
    if (!field || !field.name) continue;

    const writeRoles: string[] = (field as any).writeRoles || (field as any).options?.writeRoles;
    if (Array.isArray(writeRoles) && writeRoles.length > 0) {
      if (!matchesAny(writeRoles, names) && field.name in incomingData) {
        // If it's an update, check if the value is actually being changed
        if (currentData && JSON.stringify(incomingData[field.name]) === JSON.stringify(currentData[field.name])) {
          continue; // Value unchanged, allow pass-through
        }
        throw new ForbiddenException(
          `You do not have permission to modify field "${field.name}". Allowed roles: ${writeRoles.join(', ')}`,
        );
      }
    }
  }
}
