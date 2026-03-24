import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly cacheHitsTotal = new Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['store'],
    registers: [this.registry],
  });

  readonly cacheMissesTotal = new Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['store'],
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'nodepress_',
    });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
