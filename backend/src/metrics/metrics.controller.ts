import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Req() req: Request, @Res() res: Response) {
    // Optional bearer-token protection — set METRICS_TOKEN in env to enable.
    // In production the /metrics path should be blocked at nginx for external traffic
    // and only scraped by Prometheus from the internal docker network.
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${token}`) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
    }

    res.set('Content-Type', this.metrics.contentType);
    res.end(await this.metrics.metrics());
  }
}
