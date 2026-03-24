import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeoService {
  private readonly siteUrl: string;

  constructor(private readonly prisma: PrismaService) {
    // Trailing slash removed; defaults to localhost for dev
    this.siteUrl = (process.env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  async generateSitemap(): Promise<string> {
    // Fetch all published content types
    const contentTypes = await this.prisma.contentType.findMany({
      select: { name: true },
    });

    // Fetch all published, non-deleted entries
    const entries = await this.prisma.entry.findMany({
      where: { status: 'published', deletedAt: null },
      select: {
        slug: true,
        updatedAt: true,
        contentType: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date().toISOString().split('T')[0];

    const urlEntries = [
      // Homepage
      `  <url>\n    <loc>${this.siteUrl}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,

      // Content type list pages
      ...contentTypes.map(
        (ct) =>
          `  <url>\n    <loc>${this.siteUrl}/${ct.name}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`,
      ),

      // Individual entry pages
      ...entries.map((e) => {
        const lastmod = e.updatedAt.toISOString().split('T')[0];
        return `  <url>\n    <loc>${this.siteUrl}/${e.contentType.name}/${e.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
      }),
    ].join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
  }

  generateRobots(): string {
    const disallow = process.env.ROBOTS_DISALLOW ?? '';
    const lines = [
      'User-agent: *',
      'Allow: /',
      ...(disallow ? disallow.split(',').map((p) => `Disallow: ${p.trim()}`) : []),
      '',
      `Sitemap: ${this.siteUrl}/sitemap.xml`,
    ];
    return lines.join('\n');
  }
}
