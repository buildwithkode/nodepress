import type { IncomingMessage } from 'http';

/** A request whose JSON body was parsed by `express.json({ verify: keepRawBody })`. */
export type WithRawBody = IncomingMessage & { rawBody?: Buffer };

/**
 * `verify` hook for `express.json()`: keeps the body exactly as received on
 * `req.rawBody`. Payment providers sign those bytes — re-serialising the parsed
 * JSON doesn't reproduce them.
 */
export function keepRawBody(req: IncomingMessage, _res: unknown, buf: Buffer) {
  (req as WithRawBody).rawBody = buf;
}
