const RESERVED_FORM_SLUGS = ['submit', 'forms', 'api', 'auth', 'media', 'entries'];

/** The form slug as stored and used in `POST /api/submit/:slug`. */
export function normalizeFormSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function isReservedFormSlug(slug: string): boolean {
  return RESERVED_FORM_SLUGS.includes(slug);
}
