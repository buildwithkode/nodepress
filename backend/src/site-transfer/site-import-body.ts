import * as express from 'express';
import type { RequestHandler } from 'express';

/** Largest site import accepted, in MB (SITE_IMPORT_MAX_MB, default 50). */
export function siteImportMaxMb(): number {
  const n = Number(process.env.SITE_IMPORT_MAX_MB);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

/**
 * A site export is often larger than the global 1 MB JSON limit. Register this
 * BEFORE the global express.json(): it parses POST /api/site/import with the
 * higher limit, and body-parser then skips the already-parsed body.
 */
export function siteImportBodyParser(prefix = '/api'): [string, RequestHandler] {
  return [`${prefix}/site/import`, express.json({ limit: `${siteImportMaxMb()}mb` })];
}
