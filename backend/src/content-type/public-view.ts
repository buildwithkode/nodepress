import { FieldDef } from '../fields/field.types';
import { allowedMethodsOf, publicReadFields } from '../openapi/openapi.builder';

/**
 * What anonymous callers may see of content types: only types open to the
 * public API (`list` or `read` allowed), with fields hidden by `readRoles`
 * removed and no previewUrl — the same view OpenAPI and GraphQL publish.
 */
export function isPublicContentType(ct: { allowedMethods?: unknown }, method?: 'list' | 'read'): boolean {
  const methods = allowedMethodsOf(ct as any);
  return method ? methods.has(method) : methods.has('list') || methods.has('read');
}

export function publicContentType<T extends { schema: unknown; previewUrl?: string | null }>(ct: T) {
  const { previewUrl: _previewUrl, ...rest } = ct;
  const schema = Array.isArray(ct.schema) ? publicReadFields(ct.schema as FieldDef[]) : [];
  return { ...rest, schema };
}
