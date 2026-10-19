import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImageTransformService } from './image-transform.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

/** 400×200: left half red, right half blue. */
async function makeImage(path: string) {
  const half = (r: number, b: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g: 0, b } } }).png().toBuffer();
  await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: await half(255, 0), left: 0, top: 0 }, { input: await half(0, 255), left: 200, top: 0 }])
    .jpeg()
    .toFile(path);
}

describe('ImageTransformService', () => {
  let dir: string;
  let prisma: any;
  let svc: ImageTransformService;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'np-img-'));
    await makeImage(join(dir, 'pic.jpg'));
    prisma = { media: { findUnique: jest.fn().mockResolvedValue({ filename: 'pic.jpg', mimetype: 'image/jpeg', url: '/uploads/pic.jpg', focalX: null, focalY: null }) } };
    svc = new ImageTransformService(prisma, { getUrl: (f: string) => `https://cdn.example.com/${f}` } as any);
    (svc as any).uploadsDir = dir;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects path traversal and unknown files', async () => {
    await expect(svc.transform('../secret.jpg', {})).rejects.toThrow(BadRequestException);
    prisma.media.findUnique.mockResolvedValueOnce(null);
    await expect(svc.transform('missing.jpg', {})).rejects.toThrow(NotFoundException);
  });

  it('renders a snapped variant once and serves it from cache after', async () => {
    const first = await svc.transform('pic.jpg', { w: '150', format: 'png' });
    expect(first.contentType).toBe('image/png');
    expect(first.filePath).toMatch(/pic_w192_ho_q80_inside\.png$/);
    expect(first.cacheControl).toContain('immutable');
    const meta = await sharp(first.filePath).metadata();
    expect(meta.width).toBe(192);

    // A cache hit refreshes the mtime (what the LRU prune goes by).
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    utimesSync(first.filePath, dayAgo, dayAgo);
    const second = await svc.transform('pic.jpg', { w: '180', format: 'png' }); // same bucket
    expect(second.filePath).toBe(first.filePath);
    expect(statSync(second.filePath).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it('crops around the focal point for cover', async () => {
    prisma.media.findUnique.mockResolvedValue({ filename: 'pic.jpg', mimetype: 'image/jpeg', url: '/uploads/pic.jpg', focalX: 0.95, focalY: 0.5 });
    const res = await svc.transform('pic.jpg', { w: '64', h: '64', fit: 'cover', format: 'png', fp: '0.95,0.5' });
    const { data } = await sharp(res.filePath).raw().toBuffer({ resolveWithObject: true });
    // Focal point on the blue half → the crop is blue, not red.
    expect(data[2]).toBeGreaterThan(200);
    expect(data[0]).toBeLessThan(50);
    expect(res.cacheControl).toContain('immutable'); // fp matches the stored point
    const unpinned = await svc.transform('pic.jpg', { w: '64', h: '64', fit: 'cover', format: 'png' });
    expect(unpinned.cacheControl).toBe('public, max-age=3600');
  });

  describe('originals on S3', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => { originalFetch = global.fetch; });
    afterEach(() => { global.fetch = originalFetch; });

    it('fetches the original once from storage, then transforms it', async () => {
      const bytes = require('fs').readFileSync(join(dir, 'pic.jpg'));
      rmSync(join(dir, 'pic.jpg')); // not on local disk
      prisma.media.findUnique.mockResolvedValue({ filename: 'pic.jpg', mimetype: 'image/jpeg', url: 'https://cdn.example.com/pic.jpg' });
      global.fetch = jest.fn().mockImplementation(async () => new Response(bytes, { headers: { 'content-length': String(bytes.length) } }));

      const res = await svc.transform('pic.jpg', { w: '64', format: 'png' });
      expect((await sharp(res.filePath).metadata()).width).toBe(64);
      expect(global.fetch).toHaveBeenCalledWith('https://cdn.example.com/pic.jpg', expect.anything());

      await svc.transform('pic.jpg', { w: '128', format: 'png' }); // new variant, cached source
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('refuses originals over 25 MB and missing ones', async () => {
      rmSync(join(dir, 'pic.jpg'));
      prisma.media.findUnique.mockResolvedValue({ filename: 'pic.jpg', mimetype: 'image/jpeg', url: 'https://cdn.example.com/pic.jpg' });
      global.fetch = jest.fn().mockResolvedValueOnce(new Response('x', { headers: { 'content-length': String(30 * 1024 * 1024) } }));
      await expect(svc.transform('pic.jpg', { w: '64' })).rejects.toThrow(/too large/);
      global.fetch = jest.fn().mockResolvedValueOnce(new Response('nope', { status: 404 }));
      await expect(svc.transform('pic.jpg', { w: '64' })).rejects.toThrow(NotFoundException);
    });
  });

  it('format=auto varies on Accept', async () => {
    const res = await svc.transform('pic.jpg', { w: '32', format: 'auto' }, 'image/webp,*/*');
    expect(res.contentType).toBe('image/webp');
    expect(res.vary).toBe('Accept');
  });

  it('refuses non-images', async () => {
    prisma.media.findUnique.mockResolvedValueOnce({ filename: 'pic.jpg', mimetype: 'application/pdf' });
    await expect(svc.transform('pic.jpg', {})).rejects.toThrow('Not an image');
  });

  it('answers 503 when the encode queue is full', async () => {
    (svc as any).active = 99;
    (svc as any).waiting = Array.from({ length: 50 }, () => () => undefined);
    await expect(svc.transform('pic.jpg', { w: '16' })).rejects.toThrow(/queue is full/);
  });

  it('prunes variants unused for 30 days and the LRU ones above the cap', async () => {
    const variants = join(dir, '.cache', 'variants');
    mkdirSync(variants, { recursive: true });
    const old = join(variants, 'old.webp');
    const fresh = join(variants, 'fresh.webp');
    writeFileSync(old, 'x');
    writeFileSync(fresh, 'y');
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    utimesSync(old, longAgo, longAgo);
    await svc.pruneCache();
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);

    (svc as any).cacheLimitBytes = 0;
    await svc.pruneCache();
    expect(readdirSync(variants)).toEqual([]);
  });
});
