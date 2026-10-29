// Copyright (c) 2026-present BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

import { createRequire } from 'module';
import { join, resolve } from 'path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

// Paths the API answers. /api/draft and /api/disable-draft are the admin's own
// route handlers (draft mode), so they go to Next with everything else.
const API_PATH = /^\/(api|uploads|graphql)(\/|$)/;
const ADMIN_API_PATH = /^\/api\/(draft|disable-draft)\/?$/;

export function isApiPath(path: string): boolean {
  return API_PATH.test(path) && !ADMIN_API_PATH.test(path);
}

/**
 * Single-process mode: serve the built admin (`next build` output in `adminDir`)
 * from the API's own server, so one `node` process and one port run the whole
 * CMS — no reverse-proxy rules, no CORS between admin and API. Docker and local
 * development keep running the two separately.
 *
 * Must be registered before the API's routes (Nest adds them on listen), so
 * anything that isn't an API path reaches Next first.
 */
export async function mountAdmin(app: NestExpressApplication, adminDir: string, port: number): Promise<void> {
  const dir = resolve(adminDir);
  // The admin's server components fetch the API through BACKEND_URL — here
  // that's this same process. Under Phusion Passenger (cPanel) the process
  // listens on Passenger's socket, not on PORT, so go through the public URL.
  process.env.BACKEND_URL ||= (global as { PhusionPassenger?: unknown }).PhusionPassenger && process.env.APP_URL
    ? process.env.APP_URL
    : `http://127.0.0.1:${port}`;

  // Loading Next replaces the global `Date` with a wrapper (for
  // `cacheComponents`, which the admin doesn't use). Same prototype, so
  // `instanceof` still works, but a different constructor: @nestjs/graphql maps
  // fields typed `Date` by constructor identity and fails to build the schema
  // ("Cannot determine a GraphQL output type for createdAt"). Put it back.
  const OriginalDate = Date;

  // `next` belongs to the admin, not the API: resolve it from the admin's folder.
  const mod = createRequire(join(dir, 'package.json'))('next');
  const createNext = mod.default ?? mod;
  const admin = createNext({ dev: false, dir });
  await admin.prepare();
  const handle = admin.getRequestHandler();

  if (globalThis.Date !== OriginalDate) {
    globalThis.Date = OriginalDate;
    Object.defineProperty(OriginalDate.prototype, 'constructor', {
      value: OriginalDate,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isApiPath(req.path)) return next();
    void handle(req, res);
  });
}
