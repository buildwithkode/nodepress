import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ImporterService, WORDPRESS_IMPORT_JOB, coerceForField } from './importer.service';

const fixture = readFileSync(join(__dirname, '../../test/fixtures/wordpress-sample.xml'));

function makeService(prisma: any = {}) {
  const jobs = { registerHandler: jest.fn(), enqueue: jest.fn() };
  const svc = new ImporterService(prisma, jobs as any, {} as any, {} as any, {} as any, { log: jest.fn() } as any);
  return { svc, jobs };
}

describe('ImporterService', () => {
  it('registers the import job handler', () => {
    const { svc, jobs } = makeService();
    svc.onModuleInit();
    expect(jobs.registerHandler).toHaveBeenCalledWith(WORDPRESS_IMPORT_JOB, expect.any(Function));
  });

  it('rejects an empty upload and a non-WordPress file', () => {
    const { svc } = makeService();
    expect(() => svc.parse(undefined)).toThrow(BadRequestException);
    expect(() => svc.parse(Buffer.from('<html/>'))).toThrow(/Not a valid WordPress export/);
    expect(() => svc.parse(Buffer.from('<!DOCTYPE x [<!ENTITY a "b">]><rss/>'))).toThrow(/DOCTYPE/);
  });

  it('dry run: counts per type and status, types to create, existing entries and warnings', async () => {
    const prisma = {
      setting: { findUnique: jest.fn().mockResolvedValue({ defaultLocale: 'en' }) },
      contentType: {
        findMany: jest.fn().mockResolvedValue([
          { id: 7, name: 'post', schema: [{ name: 'title', type: 'text' }, { name: 'content', type: 'richtext' }] },
        ]),
      },
      entry: { count: jest.fn().mockResolvedValue(1) },
    };
    const { svc } = makeService(prisma);
    const res = await svc.dryRun(fixture);

    expect(res.total).toBe(6);
    expect(res.byType).toEqual({
      post: { postType: 'post', exists: true, total: 4, existing: 1, byStatus: { published: 2, draft: 2 } },
      page: { postType: 'page', exists: false, total: 1, existing: 0, byStatus: { published: 1 } },
      coffee_bean: { postType: 'coffee_bean', exists: false, total: 1, existing: 0, byStatus: { published: 1 } },
    });
    expect(res.contentTypesToCreate).toEqual(['page', 'coffee_bean']);
    expect(res.attachments).toBe(1);
    expect(res.sample).toHaveLength(5);
    expect(res.sample[0]).toMatchObject({ contentType: 'post', slug: 'perfect-v60', status: 'published', author: 'Jane Barista' });
    expect(res.warnings).toContain(
      'Content type "post" exists — only its own fields are filled (not: excerpt, featured_image, categories, tags, author, wp_id, meta)',
    );
    expect(prisma.entry.count).toHaveBeenCalledWith({
      where: { contentTypeId: 7, locale: 'en', slug: { in: ['perfect-v60', 'espresso-basics', 'cold-brew-experiments', 'summer-menu'] }, deletedAt: null },
    });
  });

  it('status: 404 for unknown jobs and jobs of another type', async () => {
    const prisma = { job: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2, type: 'form.email' }) } };
    const { svc } = makeService(prisma);
    await expect(svc.status(1)).rejects.toThrow(NotFoundException);
    await expect(svc.status(2)).rejects.toThrow(NotFoundException);
  });

  it('status: a claimed pending job is reported as running', async () => {
    const prisma = {
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3, type: WORDPRESS_IMPORT_JOB, status: 'pending', attempts: 1, lastError: null,
          payload: { originalName: 'site.xml', options: { importMedia: false, overwrite: false }, progress: { phase: 'entries', done: 2, total: 6 } },
        }),
      },
    };
    const { svc } = makeService(prisma);
    expect(await svc.status(3)).toMatchObject({ jobId: 3, status: 'running', file: 'site.xml', progress: { done: 2, total: 6 }, result: null });
  });

  it('run: fails clearly when the uploaded file is missing on this instance', async () => {
    const { svc } = makeService();
    await expect(svc.run({ file: 'nope.xml', host: 'other-box' } as any, { id: 1 })).rejects.toThrow(/missing.*other-box/);
  });
});

describe('coerceForField', () => {
  it('fits values to existing fields of another type', () => {
    expect(coerceForField(['A', 'B'], 'text')).toBe('A, B');
    expect(coerceForField(12, 'text')).toBe('12');
    expect(coerceForField({ url: 'https://x/a.png', alt: 'a' }, 'text')).toBe('https://x/a.png');
    expect(coerceForField({ brew_time: '4:00' }, 'textarea')).toBe('{"brew_time":"4:00"}');
    expect(coerceForField({}, 'textarea')).toBeUndefined();
    expect(coerceForField('12', 'number')).toBeUndefined();
    expect(coerceForField(12, 'number')).toBe(12);
    expect(coerceForField('https://x/a.png', 'image')).toBeUndefined();
    expect(coerceForField({ url: 'https://x/a.png' }, 'image')).toEqual({ url: 'https://x/a.png' });
    expect(coerceForField(['A'], 'json')).toEqual(['A']);
    expect(coerceForField(['A'], 'select')).toBeUndefined();
  });
});
