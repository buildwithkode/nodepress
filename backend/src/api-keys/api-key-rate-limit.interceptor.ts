import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppCacheService } from '../cache/app-cache.service';

/** Requests allowed per 60-second window, per API key, by access level. */
const LIMITS: Record<string, number> = {
  read:  120,
  write:  60,
  all:   120,
};

/**
 * Per-API-key fixed-window rate limiter.
 *
 * Runs after guards (so req.apiKey is already set). JWT-authenticated admin
 * requests pass through without counting — only X-API-Key requests are limited.
 *
 * Headers added to every API-key response:
 *   X-RateLimit-Limit     — max requests per window
 *   X-RateLimit-Remaining — requests left in current window
 *   X-RateLimit-Reset     — seconds until the window resets (approx. 60)
 */
@Injectable()
export class ApiKeyRateLimitInterceptor implements NestInterceptor {
  constructor(private readonly cache: AppCacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const apiKey = req.apiKey as { id: number; permissions: { access: string } } | undefined;
    if (!apiKey) return next.handle(); // JWT request — skip

    const access = (apiKey.permissions?.access as string) ?? 'read';
    const limit  = LIMITS[access] ?? 120;
    const windowKey = `ratelimit:apikey:${apiKey.id}`;

    const count = await this.cache.increment(windowKey, 60_000);

    res.setHeader('X-RateLimit-Limit',     limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset',     60);

    if (count > limit) {
      res.setHeader('Retry-After', 60);
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `API key rate limit exceeded (${limit} req/min for "${access}" access). Retry after 60 seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return next.handle();
  }
}
