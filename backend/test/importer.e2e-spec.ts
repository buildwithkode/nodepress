import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ImporterService } from '../src/importer/importer.service';

const fixture = readFileSync(join(__dirname, 'fixtures/wordpress-sample.xml'), 'utf8');

describe('WordPress import (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let importer: ImporterService;
  let token: string;
  let mediaServer: Server;
  let mediaBase: string;
  let mediaRequests = 0;
  let png: Buffer;

  const upload = (xml: string, query = '') =>
    request(app.getHttpServer())
      .post(`/api/import/wordpress${query}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(xml), 'coffee.WordPress.2026-10-01.xml');

  // Generous: the first run in a cold ts-jest cache compiles the import path while the job runs.
  async function waitForImport(jobId: number, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await request(app.getHttpServer())
        .get(`/api/import/wordpress/${jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (res.body.status === 'done' || res.body.status === 'failed') return res.body;
      if (Date.now() > deadline) throw new Error(`Import #${jobId} still ${res.body.status}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function runImport(xml: string, query = '') {
    const res = await upload(xml, query).expect(201);
    expect(res.body).toMatchObject({ jobId: expect.any(Number), status: 'pending', total: 6 });
    return waitForImport(res.body.jobId);
  }

  const entry = async (type: string, slug: string) =>
    prisma.entry.findFirst({ where: { slug, contentType: { name: type } }, include: { contentType: true } });

  beforeAll(async () => {
    png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#a0522d' } }).png().toBuffer();
    mediaServer = createServer((req, res) => {
      mediaRequests++;
      if (req.url === '/wp-content/uploads/2025/01/v60-grinder.png') {
        res.setHeader('Content-Type', 'image/png');
        res.end(png);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => mediaServer.listen(0, '127.0.0.1', r));
    mediaBase = `http://127.0.0.1:${(mediaServer.address() as AddressInfo).port}`;

    app = await createTestApp();
    prisma = app.get(PrismaService);
    importer = app.get(ImporterService);
    await cleanDatabase(app);
    await prisma.mediaFolder.deleteMany();
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    const media = await prisma.media.findMany();
    for (const m of media) {
      for (const f of [m.filename, m.webpFilename]) {
        if (f && existsSync(join(process.cwd(), 'uploads', f))) unlinkSync(join(process.cwd(), 'uploads', f));
      }
    }
    await prisma.mediaFolder.deleteMany();
    await cleanDatabase(app);
    await app.close();
    await new Promise((r) => mediaServer.close(r));
  });

  it('is admin only', async () => {
    await request(app.getHttpServer()).post('/api/import/wordpress?dryRun=true').expect(401);
    await request(app.getHttpServer()).get('/api/import/wordpress/1').expect(401);
  });

  it('rejects files that are not WordPress exports, and entity declarations', async () => {
    const bad = await upload('<html><body>nope</body></html>', '?dryRun=true').expect(400);
    expect(bad.body.message).toMatch(/Not a valid WordPress export/);
    const bomb = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss>&b;</rss>';
    const res = await upload(bomb, '?dryRun=true').expect(400);
    expect(res.body.message).toMatch(/DOCTYPE/);
    await request(app.getHttpServer())
      .post('/api/import/wordpress?dryRun=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('dry run reports what would be imported without writing anything', async () => {
    const res = await upload(fixture, '?dryRun=true').expect(201);
    expect(res.body).toMatchObject({
      dryRun: true,
      site: { title: 'Sample Coffee Blog', version: '1.2' },
      total: 6,
      contentTypesToCreate: ['post', 'page', 'coffee_bean'],
      attachments: 1,
      skipped: { 'status:trash': 1, 'type:nav_menu_item': 1 },
      byType: {
        post: { total: 4, exists: false, existing: 0, byStatus: { published: 2, draft: 2 } },
        page: { total: 1, byStatus: { published: 1 } },
        coffee_bean: { total: 1, byStatus: { published: 1 } },
      },
    });
    expect(res.body.sample).toHaveLength(5);
    expect(res.body.warnings).toContain('Custom taxonomies are not imported: origin');
    expect(await prisma.contentType.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
  });

  it('imports posts, pages and custom post types as a background job', async () => {
    const status = await runImport(fixture);
    expect(status.status).toBe('done');
    expect(status.result).toMatchObject({
      contentTypesCreated: ['post', 'page', 'coffee_bean'],
      byType: {
        post: { created: 4, updated: 0, skipped: 0, failed: 0 },
        page: { created: 1, skipped: 0, failed: 0 },
        coffee_bean: { created: 1, skipped: 0, failed: 0 },
      },
      media: { imported: 0, reused: 0, failed: 0 },
      errors: [],
    });
    expect(status.progress).toMatchObject({ phase: 'entries', done: 6, total: 6 });

    const post = await entry('post', 'perfect-v60');
    expect(post).toMatchObject({ status: 'published', locale: 'en' });
    expect(post!.createdAt.toISOString()).toBe('2025-01-14T07:30:00.000Z');
    const data = post!.data as any;
    expect(data).toMatchObject({
      title: 'How to brew the perfect V60',
      excerpt: 'A slow, sweet cup in four minutes.',
      categories: ['Brewing', 'Pour Over'],
      tags: ['V60'],
      author: 'Jane Barista',
      wp_id: 11,
      meta: { brew_time: '4:00' },
      featured_image: { url: 'https://coffee.example.com/wp-content/uploads/2025/01/v60-grinder.png', alt: 'A hand grinder next to a V60' },
    });
    expect(data.content).toContain('<strong>15 g</strong>');
    expect(data.content).not.toContain('<script>'); // sanitized like any richtext write

    expect(await entry('post', 'cold-brew-experiments')).toMatchObject({ status: 'draft', publishAt: null });
    const future = await entry('post', 'summer-menu');
    expect(future).toMatchObject({ status: 'draft' });
    expect(future!.publishAt!.toISOString()).toBe('2031-06-01T08:00:00.000Z');
    expect(await entry('page', 'about')).toMatchObject({ status: 'published' });
    const bean = await entry('coffee_bean', 'ethiopia-yirgacheffe');
    expect((bean!.data as any).meta).toEqual({ roast_level: 'light', tasting_notes: 'a:2:{i:0;s:7:"jasmine";i:1;s:5:"lemon";}' });
    expect(bean!.contentType.displayName).toBe('Coffee Bean');
    expect(await prisma.entry.count()).toBe(6);

    // Published entries are on the public API; drafts are not.
    const pub = await request(app.getHttpServer()).get('/api/post').expect(200);
    expect(pub.body.data.map((e: any) => e.slug).sort()).toEqual(['espresso-basics', 'perfect-v60']);

    // Audited, and the uploaded file is cleaned up.
    const audit = await prisma.auditLog.findFirst({ where: { resource: 'import', resourceId: `wordpress#${status.jobId}` } });
    expect(audit).toMatchObject({ action: 'created', userEmail: 'admin@test.com' });
    expect(readdirSync(importer.importsDir).filter((f) => f.endsWith('.xml'))).toEqual([]);
  });

  it('skips entries that already exist on a second run', async () => {
    const status = await runImport(fixture);
    expect(status.result.contentTypesCreated).toEqual([]);
    expect(status.result.byType).toEqual({
      post: { created: 0, updated: 0, skipped: 4, failed: 0 },
      page: { created: 0, updated: 0, skipped: 1, failed: 0 },
      coffee_bean: { created: 0, updated: 0, skipped: 1, failed: 0 },
    });
    expect(await prisma.entry.count()).toBe(6);

    const dry = await upload(fixture, '?dryRun=true').expect(201);
    expect(dry.body.contentTypesToCreate).toEqual([]);
    expect(dry.body.byType.post).toMatchObject({ exists: true, existing: 4 });
  });

  it('refuses to download media from private addresses', async () => {
    const xml = fixture.replace(/https:\/\/coffee\.example\.com\/wp-content\/uploads/g, `${mediaBase}/wp-content/uploads`);
    const before = mediaRequests;
    const status = await runImport(xml, '?importMedia=true');
    expect(status.result.media).toEqual({ imported: 0, reused: 0, failed: 1 });
    expect(status.result.errors[0]).toMatch(/private/);
    expect(mediaRequests).toBe(before);
  });

  it('with overwrite + importMedia: downloads attachments and rewrites their URLs', async () => {
    importer.downloadOptions = { ...importer.downloadOptions, allowPrivate: true }; // the test server is on 127.0.0.1
    try {
      const xml = fixture.replace(/https:\/\/coffee\.example\.com\/wp-content\/uploads/g, `${mediaBase}/wp-content/uploads`);
      const status = await runImport(xml, '?importMedia=true&overwrite=true');
      expect(status.result.media).toEqual({ imported: 1, reused: 0, failed: 0 });
      expect(status.result.byType.post).toEqual({ created: 0, updated: 4, skipped: 0, failed: 0 });
      expect(status.options).toEqual({ importMedia: true, overwrite: true });

      const media = await prisma.media.findFirst({ include: { folder: true } });
      expect(media).toMatchObject({ originalName: 'v60-grinder.png', mimetype: 'image/png', width: 8, folder: { name: 'WordPress import' } });

      const post = await entry('post', 'perfect-v60');
      const data = post!.data as any;
      expect(data.featured_image).toEqual({ url: media!.url, alt: 'A hand grinder next to a V60' });
      expect(data.content).toContain(`src="${media!.url}"`);   // the -300x200 copy points at the original
      expect(data.content).toContain(`href="${media!.url}"`);
      expect(data.content).not.toContain(mediaBase);
      expect(await prisma.entryVersion.count({ where: { entryId: post!.id } })).toBe(1); // update snapshots a version

      // Running again reuses the imported file instead of downloading it again.
      const requests = mediaRequests;
      const again = await runImport(xml, '?importMedia=true');
      expect(again.result.media).toEqual({ imported: 0, reused: 1, failed: 0 });
      expect(mediaRequests).toBe(requests);
      expect(await prisma.media.count()).toBe(1);
    } finally {
      importer.downloadOptions = { ...importer.downloadOptions, allowPrivate: false };
    }
  });

  it('404s for unknown import jobs', async () => {
    await request(app.getHttpServer())
      .get('/api/import/wordpress/999999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
