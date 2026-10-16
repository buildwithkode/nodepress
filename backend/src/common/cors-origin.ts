import { env } from '../config/env';

type OriginCallback = (err: Error | null, origin?: boolean | string) => void;

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * CORS origin check shared by the HTTP API (main.ts) and the Socket.io gateway,
 * so both accept exactly the same origins.
 *
 * - No Origin header (curl, server-to-server, mobile apps) → allowed.
 * - Outside production, any localhost / 127.0.0.1 port → allowed.
 * - Otherwise only entries of the comma-separated CORS_ORIGIN.
 * - '*' sends a literal wildcard rather than echoing the origin, so browsers
 *   still refuse credentialed cross-site requests.
 * - Disallowed origins get no CORS headers (not an Error, which becomes a 500).
 */
export function corsOrigin(origin: string | undefined, callback: OriginCallback): void {
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin) return callback(null, true);
  if (env.NODE_ENV !== 'production' && LOCALHOST_ORIGIN.test(origin)) return callback(null, true);
  if (origins.includes(origin)) return callback(null, true);
  if (origins.includes('*')) return callback(null, '*');
  return callback(null, false);
}
