import { BadRequestException } from '@nestjs/common';

/** Longest preview URL template a content type may store. */
export const PREVIEW_URL_MAX_LENGTH = 2048;

/** The placeholders the entry editor fills in. */
export const PREVIEW_URL_PLACEHOLDERS = ['{slug}', '{locale}', '{token}'] as const;

/** An http(s) URL template, or empty to clear it. Used by the DTOs' @Matches. */
export const PREVIEW_URL_PATTERN = /^(https?:\/\/[^\s]+)?$/i;

/**
 * Checks a preview URL template ("https://site.example/blog/{slug}?token={token}")
 * and returns what to store: the trimmed template, or null to clear it.
 * The import path doesn't go through the DTOs, so the service calls this too.
 */
export function normalizePreviewUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException('previewUrl must be a string');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > PREVIEW_URL_MAX_LENGTH) {
    throw new BadRequestException(`previewUrl must be at most ${PREVIEW_URL_MAX_LENGTH} characters`);
  }
  // Fill the placeholders with sample values so the template parses as a URL.
  const sample = trimmed.replace(/\{(slug|locale|token)\}/g, 'x');
  let url: URL;
  try {
    url = new URL(sample);
  } catch {
    throw new BadRequestException('previewUrl must be an http(s) URL template');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('previewUrl must start with http:// or https://');
  }
  // Placeholders in the host would let an entry's slug pick the origin the
  // editor posts draft data to.
  const authority = trimmed.match(/^https?:\/\/[^/?#]*/i)?.[0] ?? '';
  if (authority.includes('{')) {
    throw new BadRequestException('previewUrl placeholders are not allowed in the host');
  }
  return trimmed;
}
