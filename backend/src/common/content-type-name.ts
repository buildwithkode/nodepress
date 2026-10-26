/**
 * Content type names are stored lowercase snake_case (`About Us`, `about-us` →
 * `about_us`) — that form is also used for GraphQL types and permissions. URLs
 * use hyphens (`/api/about-us`); the underscore form keeps working.
 */
export const contentTypeName = (raw: string): string => raw.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** URL segment for a stored content type name: `about_us` → `about-us`. */
export const contentTypePath = (name: string): string => name.replace(/_/g, '-');

/** Whether an API key's `contentTypes` list covers a type named in a URL (any form). */
export const keyCoversType = (contentTypes: string[], type: string): boolean =>
  contentTypes[0] === '*' || contentTypes.map(contentTypeName).includes(contentTypeName(type));
