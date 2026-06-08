import { SeoService } from './seo.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  contentType: { findMany: jest.fn() },
  entry: { findMany: jest.fn() },
};

const makeEntry = (slug: string, seo: any = null) => ({
  slug,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  seo,
  contentType: { name: 'blog' },
});

describe('SeoService', () => {
  let service: SeoService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SITE_URL = 'https://example.com';
    service = new SeoService(mockPrisma as unknown as PrismaService);
  });

  describe('generateSitemap', () => {
    it('excludes entries flagged seo.noIndex (regression)', async () => {
      mockPrisma.contentType.findMany.mockResolvedValue([{ name: 'blog' }]);
      mockPrisma.entry.findMany.mockResolvedValue([
        makeEntry('indexed-post'),
        makeEntry('hidden-post', { noIndex: true }),
        makeEntry('also-indexed', { title: 'Has SEO but not noindex' }),
      ]);

      const xml = await service.generateSitemap();

      expect(xml).toContain('https://example.com/blog/indexed-post');
      expect(xml).toContain('https://example.com/blog/also-indexed');
      // The noIndex entry must NOT be advertised to crawlers via the sitemap.
      expect(xml).not.toContain('hidden-post');
    });

    it('includes the homepage and one URL per content type', async () => {
      mockPrisma.contentType.findMany.mockResolvedValue([{ name: 'blog' }, { name: 'pages' }]);
      mockPrisma.entry.findMany.mockResolvedValue([]);

      const xml = await service.generateSitemap();

      expect(xml).toContain('<loc>https://example.com/</loc>');
      expect(xml).toContain('<loc>https://example.com/blog</loc>');
      expect(xml).toContain('<loc>https://example.com/pages</loc>');
    });
  });

  describe('generateRobots', () => {
    it('allows all crawlers and links the sitemap', () => {
      const robots = service.generateRobots();
      expect(robots).toContain('User-agent: *');
      expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
    });
  });
});
