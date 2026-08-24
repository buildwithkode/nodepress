import { ForbiddenException } from '@nestjs/common';
import { FieldDef } from '../fields/field.types';

/**
 * Filter out fields from entry data that the user's role is not authorized to read.
 *
 * @param data - Raw entry data payload
 * @param schema - Content type FieldDef[] schema
 * @param role - User's role (e.g. 'admin', 'editor', 'viewer', or undefined for public)
 * @returns Cleaned data object with unauthorized read fields removed
 */
export function filterUnauthorizedReadFields(
  data: Record<string, any> | undefined | null,
  schema: FieldDef[],
  role?: string,
): Record<string, any> {
  if (!data || typeof data !== 'object') return data || {};
  if (role === 'admin') return data; // Admin has universal access

  const sanitized: Record<string, any> = { ...data };

  for (const field of schema) {
    if (!field || !field.name) continue;

    const readRoles: string[] = (field as any).readRoles || (field as any).options?.readRoles;
    if (Array.isArray(readRoles) && readRoles.length > 0) {
      const allowed = role && readRoles.includes(role);
      if (!allowed) {
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
 * @param role - User's role
 * @throws ForbiddenException if unauthorized field mutation is attempted
 */
export function validateFieldWritePermissions(
  incomingData: Record<string, any> | undefined | null,
  currentData: Record<string, any> | undefined | null,
  schema: FieldDef[],
  role?: string,
): void {
  if (!incomingData || typeof incomingData !== 'object') return;
  if (role === 'admin') return; // Admin has universal write access

  for (const field of schema) {
    if (!field || !field.name) continue;

    const writeRoles: string[] = (field as any).writeRoles || (field as any).options?.writeRoles;
    if (Array.isArray(writeRoles) && writeRoles.length > 0) {
      const allowed = role && writeRoles.includes(role);
      if (!allowed && field.name in incomingData) {
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
