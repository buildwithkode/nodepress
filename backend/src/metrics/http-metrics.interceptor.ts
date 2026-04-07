import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Normalize dynamic path segments to avoid high cardinality in metric labels.
 * e.g. /api/blog/my-post → /api/:type/:slug
 *      /api/entries/42   → /api/entries/:id
 */
function normalizePath(routePath: string | undefined, url: string): string {
  if (routePath) return routePath;
  // fallback: strip numeric / uuid segments
  return url
    .split('?')[0]
    .replace(/\/[0-9a-f-]{8,}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    || '/';
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req  = context.switchToHttp().getRequest();
    const method = req.method as string;
    const start  = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.record(context, method, start),
        error: () => this.record(context, method, start),
      }),
    );
  }

  private record(ctx: ExecutionContext, method: string, start: bigint) {
    const res    = ctx.switchToHttp().getResponse();
    const req    = ctx.switchToHttp().getRequest();
    const status = String(res.statusCode);
    const path   = normalizePath(req.route?.path, req.url);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e9;

    this.metrics.httpRequestsTotal.inc({ method, path, status });
    this.metrics.httpRequestDurationSeconds.observe({ method, path, status }, durationMs);
  }
}
