import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { cdnCacheTtl } from '../cdn/cdn-purge.service';

/**
 * HttpCacheInterceptor — ETag + Cache-Control for public dynamic-API GETs.
 *
 * Browsers get `max-age=0`: they revalidate every time, which is a cheap 304
 * thanks to the ETag, so a publish is visible on the next page view. Shared
 * caches (a CDN) keep the response for `s-maxage` = cdnCacheTtl(): long when a
 * CDN purge driver is configured (purged on every write via Cache-Tag /
 * Surrogate-Key), short otherwise.
 *
 * A response already marked private (unpublished stages, see
 * StageAccessGuard) keeps its header and is never made public.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx  = context.switchToHttp();
    const req  = ctx.getRequest<Request>();
    const res  = ctx.getResponse<Response>();

    // Only cache GET requests — mutations must never be cached
    if (req.method !== 'GET') return next.handle();

    return next.handle().pipe(
      map((body) => {
        if (res.headersSent) return body;

        const preset = String(res.getHeader('Cache-Control') ?? '');
        const isPrivate = preset.startsWith('private') || preset.includes('no-store');

        const json  = JSON.stringify(body);
        const etag  = `"${createHash('sha1').update(json).digest('hex').slice(0, 20)}"`;
        const ifNoneMatch = req.headers['if-none-match'];

        res.setHeader('ETag', etag);
        if (!isPrivate) {
          res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${cdnCacheTtl()}, stale-while-revalidate=60`);
        }
        res.setHeader('Vary', 'Accept-Encoding');

        // Standard HTTP conditional request: return 304 if content hasn't changed
        if (ifNoneMatch === etag) {
          res.status(304).end();
          return null;
        }

        return body;
      }),
    );
  }
}
