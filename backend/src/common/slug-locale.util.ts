import { BadRequestException } from '@nestjs/common';

/**
 * Entry slugs end up in URLs (/api/:type/:slug, sitemap, site routes): lowercase
 * letters and digits separated by single hyphens or underscores — what the admin's
 * slug field produces (frontend lib/utils.ts cleanSlug), plus underscores.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const SLUG_MAX = 200;

export function assertValidSlug(slug: unknown): string {
  const s = typeof slug === 'string' ? slug : '';
  if (!s || s.length > SLUG_MAX || !SLUG_PATTERN.test(s)) {
    throw new BadRequestException(
      `Invalid slug "${String(slug).slice(0, 60)}" — use lowercase letters, numbers and hyphens (e.g. "my-first-post")`,
    );
  }
  return s;
}

/**
 * Canonical BCP 47 form ("EN" → "en", "pt-br" → "pt-BR", "zh-hant" → "zh-Hant").
 * Blank → `fallback`. Throws 400 on anything that isn't a language tag.
 */
export function canonicalLocale(locale: unknown, fallback = 'en'): string {
  const raw = typeof locale === 'string' ? locale.trim() : '';
  if (!raw) return fallback;
  try {
    const [canonical] = Intl.getCanonicalLocales(raw);
    if (canonical && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(canonical)) return canonical;
  } catch { /* RangeError: not a language tag */ }
  throw new BadRequestException(`Invalid locale "${raw.slice(0, 40)}" — use a language code such as en, fr or pt-BR`);
}
