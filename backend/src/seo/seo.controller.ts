import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SeoService } from './seo.service';

@ApiExcludeController()
@SkipThrottle()
@Controller()
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response) {
    const xml = await this.seoService.generateSitemap();
    res.type('application/xml').send(xml);
  }

  @Get('robots.txt')
  robots(@Res() res: Response) {
    const text = this.seoService.generateRobots();
    res.type('text/plain').send(text);
  }
}
