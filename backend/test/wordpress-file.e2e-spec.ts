import { INestApplication } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import request from 'supertest';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataValidator } from '../src/fields/data.validator';
import { FieldDef } from '../src/fields/field.types';

/**
 * Imports a real WordPress export end to end — opt-in, for checking a site's
 * file before (or after) a change to the importer:
 *
 *   WXR_FILE=~/Downloads/site.WordPress.xml npm run test:e2e -- test/wordpress-file.e2e-spec.ts
 *
 * WXR_MEDIA=true also downloads the site's media (from the live WordPress site).
 */
const file = process.env.WXR_FILE;
const withMedia = process.env.WXR_MEDIA === 'true';

(file ? describe : describe.skip)(`WordPress import of ${file ? basename(file) : 'WXR_FILE'} (e2e)`, () => {
  jest.setTimeout(600_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const xml = file ? readFileSync(file) : Buffer.alloc(0);

  const upload = (query: string) =>
    request(app.getHttpServer())
      .post(`/api/import/wordpress${query}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', xml, basename(file ?? 'export.xml'));

  async function runImport(query: string) {
    const res = await upload(query).expect(201);
    for (const deadline = Date.now() + 540_000; ;) {
      const status = await request(app.getHttpServer())
        .get(`/api/import/wordpress/${res.body.jobId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (status.body.status === 'done' || status.body.status === 'failed') return status.body;
      if (Date.now() > deadline) throw new Error(`Import still ${status.body.status}`);
      await new Promise((r) => setTimeout(r, 1500)); // under the 120/min rate limit
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);
    token = await registerAdmin(app);
  });

  const startedAt = Date.now();
  afterAll(async () => {
    // A job cut short (a failed run) leaves its copy of the export behind.
    const imports = join(process.cwd(), 'uploads', '.cache', 'imports');
    for (const f of existsSync(imports) ? readdirSync(imports) : []) {
      if (statSync(join(imports, f)).mtimeMs >= startedAt) unlinkSync(join(imports, f));
    }
    for (const m of await prisma.media.findMany()) {
      for (const f of [m.filename, m.webpFilename]) {
        if (f && existsSync(join(process.cwd(), 'uploads', f))) unlinkSync(join(process.cwd(), 'uploads', f));
      }
    }
    await prisma.mediaFolder.deleteMany();
    await cleanDatabase(app);
    await app.close();
  });

  const all = `?authors=true&comments=true&importMedia=${withMedia}`;

  it('dry run', async () => {
    const res = await upload(`${all}&dryRun=true`).expect(201);
    console.log(JSON.stringify({
      site: res.body.site, total: res.body.total, contentTypesToCreate: res.body.contentTypesToCreate,
      byType: res.body.byType, skipped: res.body.skipped, stats: res.body.stats, warnings: res.body.warnings,
    }, null, 2));
  });

  it('imports without errors, and every entry is valid for its type', async () => {
    const status = await runImport(all);
    console.log(JSON.stringify(status.result, null, 2));
    expect(status.status).toBe('done');
    expect(status.result.errors).toEqual([]);
    for (const counts of Object.values<any>(status.result.byType)) expect(counts.failed).toBe(0);

    const validator = new DataValidator();
    const types = await prisma.contentType.findMany({ include: { entries: true } });
    for (const ct of types) {
      for (const e of ct.entries) {
        expect(() => validator.validate(e.data as Record<string, unknown>, ct.schema as unknown as FieldDef[])).not.toThrow();
        expect(JSON.stringify(e.data)).not.toContain('__wp_ref');
      }
    }
    // Links to other imported entries at any depth (sections, repeaters…), to compare with the site.
    const byPublicId = new Map(types.flatMap((ct) => ct.entries.map((e) => [e.publicId, `${ct.name}/${e.slug}`] as const)));
    const links: string[] = [];
    const walk = (v: unknown, path: string, from: string) => {
      if (typeof v === 'string' && byPublicId.has(v)) links.push(`${from}.${path} → ${byPublicId.get(v)}`);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, from));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, from);
    };
    for (const ct of types) for (const e of ct.entries) walk(e.data, '', `${ct.name}/${e.slug}`);
    if (withMedia) {
      // Media URLs still pointing at WordPress: files that weren't attachments (theme assets, other sites).
      const left = types.flatMap((ct) => ct.entries.flatMap((e) => JSON.stringify(e.data).match(/https?:\/\/[^"\s]*\/wp-content\/uploads\/[^"\s)]*/g) ?? []));
      console.log(`WordPress media URLs left: ${left.length}${left.length ? `\n${[...new Set(left)].slice(0, 20).join('\n')}` : ''}`);
    }
    console.log(`Linked entries:\n${links.filter((l) => !/\.author_ref /.test(l)).join('\n') || 'none'}`);
  });

  it('imports again over the same entries without errors', async () => {
    const status = await runImport(`${all}&overwrite=true`);
    expect(status.result.errors).toEqual([]);
    expect(status.result.contentTypesCreated).toEqual([]);
    for (const counts of Object.values<any>(status.result.byType)) expect(counts).toMatchObject({ created: 0, failed: 0 });
  });
});
