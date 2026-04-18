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

/**
 * HttpCacheInterceptor — adds ETag and Cache-Control headers to GET responses.
 *
 * Applied to public dynamic-API GET routes. Allows CDNs, reverse proxies, and
 * browsers to cache responses and serve 304 Not Modified when content is
 * unchanged, eliminating unnecessary data transfer.
 *
 * TTL is intentionally kept short (30 s) to match the server-side cache so
 * stale content is never served for longer than the server TTL.
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

        const json  = JSON.stringify(body);
        const etag  = `"${createHash('sha1').update(json).digest('hex').slice(0, 20)}"`;
        const ifNoneMatch = req.headers['if-none-match'];

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
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
