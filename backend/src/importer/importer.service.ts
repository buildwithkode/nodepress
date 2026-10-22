import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { hostname } from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService, ClaimedJob, JOB_LEASE_MS } from '../jobs/jobs.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { EntriesService } from '../entries/entries.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../audit/audit.service';
import { FieldDef, isReverseRelation } from '../fields/field.types';
import { XmlParseError } from './xml';
import { AUTHOR_TYPE, COMMENT_TYPE, ImportPlan, PlanOptions, buildImportPlan, parseWxr, rewriteMediaUrls } from './wxr';
import { DownloadError, SafeDownloadOptions, safeDownload } from './safe-download';

export const WORDPRESS_IMPORT_JOB = 'import.wordpress';
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;   // same as POST /media/upload
const MEDIA_TIMEOUT_MS = 15_000;
const MEDIA_FOLDER = 'WordPress import';
const MAX_ERRORS = 200;
const HEARTBEAT_MS = 20_000;                 // well inside the job lease
const STALE_FILE_MS = 7 * 24 * 60 * 60_000;  // uploads of failed/abandoned imports

/** Same types as media uploads (media.controller.ts), told apart by their first bytes. */
function sniffMime(path: string): string | null {
  const buf = Buffer.alloc(12);
  const fd = openSync(path, 'r');
  let n = 0;
  try { n = readSync(fd, buf, 0, 12, 0); } finally { closeSync(fd); }
  if (n < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 4) === '%PDF') return 'application/pdf';
  if (buf.toString('latin1', 4, 8) === 'ftyp') return 'video/mp4';
  return null;
}
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'application/pdf': '.pdf', 'video/mp4': '.mp4',
};

export interface ImportOptions extends PlanOptions {
  importMedia?: boolean;
  overwrite?: boolean;
}

/** One entry to write: a post, an author or a comment. */
interface WriteItem {
  contentType: string;
  slug: string;
  status: string;
  publishAt?: string;
  date?: string;
  data: Record<string, unknown>;
  /** Relation field → [content type it must point at, publicId]; filled only when the field matches. */
  relations?: Record<string, [string, string | undefined]>;
}

type TypeInfo = { id: number; fields: Map<string, FieldDef> };

export interface ImportActor { id?: number; email: string; role?: string; ip?: string }

/** A queued import — a snapshot. The XML itself is a file (see `queue()`). */
interface ImportJobPayload {
  file: string;
  originalName: string;
  size: number;
  host: string;
  options: Required<ImportOptions>;
  actor: ImportActor;
  progress?: { done: number; total: number; phase: 'media' | 'entries' };
  result?: ImportResult;
}

interface TypeCounts { created: number; updated: number; skipped: number; failed: number }

export interface ImportResult {
  contentTypesCreated: string[];
  byType: Record<string, TypeCounts>;
  media: { imported: number; reused: number; failed: number };
  errors: string[];
  warnings: string[];
  finishedAt: string;
}

/**
 * WordPress (WXR) import. A dry run parses the upload and reports what would
 * happen; a real run stores the file and queues an `import.wordpress` job, whose
 * handler writes everything through ContentTypeService / EntriesService /
 * MediaService so validation, sanitizing, hooks, webhooks, realtime, cache
 * invalidation and search sync run as for any other write.
 */
@Injectable()
export class ImporterService implements OnModuleInit {
  private readonly logger = new Logger(ImporterService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  /**
   * The XML waits in uploads/.cache/imports (never served: the static handler
   * ignores dot-directories). It isn't put in the job payload: an export is
   * often tens of MB, and payloads are shown on the /jobs page. uploads/ is
   * already shared storage — Multer stages every media upload there.
   */
  readonly importsDir = join(this.uploadsDir, '.cache', 'imports');

  /** Media download limits. Tests flip `allowPrivate` to fetch from 127.0.0.1. */
  downloadOptions: SafeDownloadOptions = { maxBytes: MAX_MEDIA_BYTES, timeoutMs: MEDIA_TIMEOUT_MS, maxRedirects: 3 };

  constructor(
    private prisma: PrismaService,
    private jobs: JobsService,
    private contentTypes: ContentTypeService,
    private entries: EntriesService,
    private media: MediaService,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    this.jobs.registerHandler(WORDPRESS_IMPORT_JOB, async (payload: ImportJobPayload, job) => { await this.run(payload, job); });
  }

  // ── Dry run ─────────────────────────────────────────────────────────────────

  parse(buffer: Buffer | undefined, options: PlanOptions = {}): ImportPlan {
    if (!buffer?.length) throw new BadRequestException('Upload a WordPress export file (.xml) in the "file" field');
    try {
      return buildImportPlan(parseWxr(buffer.toString('utf8'), { maxLength: MAX_IMPORT_FILE_BYTES }), options);
    } catch (err: any) {
      if (err instanceof XmlParseError) throw new BadRequestException(`Not a valid WordPress export: ${err.message}`);
      throw err;
    }
  }

  /** What an import of this file would do, without writing anything. */
  async dryRun(buffer: Buffer | undefined, options: PlanOptions = {}) {
    const plan = this.parse(buffer, options);
    const locale = await this.defaultLocale();
    const typeNames = Object.keys(plan.schemas);
    const existingTypes = await this.prisma.contentType.findMany({ where: { name: { in: typeNames } } });
    const byName = new Map(existingTypes.map((ct) => [ct.name, ct]));
    const writes = planWrites(plan);

    const byType: Record<string, { postType: string; exists: boolean; total: number; existing: number; byStatus: Record<string, number> }> = {};
    for (const name of typeNames) byType[name] = { postType: postTypeOf(plan, name), exists: byName.has(name), total: 0, existing: 0, byStatus: {} };
    for (const e of writes) {
      const t = byType[e.contentType];
      t.total++;
      t.byStatus[e.status] = (t.byStatus[e.status] ?? 0) + 1;
    }
    // Entries already in NodePress (skipped, or updated with `overwrite`).
    for (const ct of existingTypes) {
      const slugs = writes.filter((e) => e.contentType === ct.name).map((e) => e.slug);
      byType[ct.name].existing = await this.prisma.entry.count({
        where: { contentTypeId: ct.id, locale, slug: { in: slugs }, deletedAt: null },
      });
    }

    const warnings = [...plan.warnings];
    for (const ct of existingTypes) {
      const fields = new Set(((ct.schema as unknown as FieldDef[]) ?? []).map((f) => f.name));
      const missing = plan.schemas[ct.name].map((f) => f.name as string).filter((f) => !fields.has(f));
      if (missing.length) warnings.push(`Content type "${ct.name}" exists — only its own fields are filled (not: ${missing.join(', ')})`);
    }

    return {
      dryRun: true,
      site: plan.site,
      locale,
      total: writes.length,
      byType,
      contentTypesToCreate: typeNames.filter((n) => !byName.has(n)),
      attachments: plan.attachments.length,
      skipped: plan.skipped,
      sample: plan.entries.slice(0, 5).map((e) => ({
        contentType: e.contentType, slug: e.slug, title: e.data.title, status: e.status,
        wpStatus: e.wpStatus, date: e.date ?? null, author: e.data.author,
        categories: e.data.categories, tags: e.data.tags,
      })),
      options: plan.options,
      stats: plan.stats,
      warnings,
    };
  }

  // ── Queue + status ──────────────────────────────────────────────────────────

  async queue(file: { buffer?: Buffer; originalname?: string } | undefined, options: ImportOptions, actor: ImportActor) {
    const plan = this.parse(file?.buffer, options); // reject a bad file now, not in the job
    mkdirSync(this.importsDir, { recursive: true });
    this.pruneStaleFiles();
    const name = `${Date.now()}-${randomBytes(16).toString('hex')}.xml`;
    writeFileSync(join(this.importsDir, name), file!.buffer!);

    const payload: ImportJobPayload = {
      file: name,
      originalName: basename(file?.originalname || 'export.xml').slice(0, 200),
      size: file!.buffer!.length,
      host: hostname(),
      options: {
        importMedia: !!options.importMedia, overwrite: !!options.overwrite, ...plan.options,
      },
      actor: { id: actor.id, email: actor.email, role: actor.role },
    };
    // Not retried automatically: an import that fails part-way is re-run from
    // /jobs, and entries it already wrote are then skipped.
    await this.jobs.enqueue(WORDPRESS_IMPORT_JOB, payload as any, { maxAttempts: 1 });
    const job = await this.prisma.job.findFirst({
      where: { type: WORDPRESS_IMPORT_JOB, payload: { path: ['file'], equals: name } },
      select: { id: true },
    });

    await this.audit.log(actor, 'created', 'import', `wordpress#${job?.id}`, {
      source: 'wordpress', jobId: job?.id, file: payload.originalName, size: payload.size,
      entries: plan.entries.length, authors: plan.authors.length, comments: plan.comments.length,
      attachments: plan.attachments.length, ...payload.options,
    });
    return { jobId: job?.id, status: 'pending', total: plan.entries.length + plan.authors.length + plan.comments.length };
  }

  async status(jobId: number) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.type !== WORDPRESS_IMPORT_JOB) throw new NotFoundException(`Import job #${jobId} not found`);
    const p = job.payload as unknown as ImportJobPayload;
    const running = job.status === 'pending' && job.attempts > 0;
    return {
      jobId: job.id,
      status: running ? 'running' : job.status,
      file: p.originalName,
      options: p.options,
      progress: p.progress ?? null,
      result: p.result ?? null,
      error: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  // ── The job ─────────────────────────────────────────────────────────────────

  async run(payload: ImportJobPayload, job: Pick<ClaimedJob, 'id'>): Promise<ImportResult> {
    const path = join(this.importsDir, basename(payload.file));
    if (!existsSync(path)) {
      throw new Error(
        `Import file ${payload.file} is missing on ${hostname()} (uploaded on ${payload.host}) — ` +
        'uploads/ must be shared between backend instances, or upload the file again',
      );
    }
    // Payloads queued before the optional extras existed have none of their flags: all off.
    const plan = buildImportPlan(parseWxr(readFileSync(path, 'utf8'), { maxLength: MAX_IMPORT_FILE_BYTES }), payload.options);
    const locale = await this.defaultLocale();
    const result: ImportResult = {
      contentTypesCreated: [], byType: {}, media: { imported: 0, reused: 0, failed: 0 },
      errors: [], warnings: [...plan.warnings], finishedAt: '',
    };
    const addError = (msg: string) => { if (result.errors.length < MAX_ERRORS) result.errors.push(msg); };

    let lastBeat = Date.now();
    const beat = async (progress: ImportJobPayload['progress'], force = false) => {
      if (!force && Date.now() - lastBeat < HEARTBEAT_MS) return;
      lastBeat = Date.now();
      // Extend the lease so a long import isn't taken for a dead worker, and show progress.
      await this.prisma.job.update({
        where: { id: job.id },
        data: { runAt: new Date(Date.now() + JOB_LEASE_MS), payload: { ...payload, progress } as any },
      });
    };

    // 1. Content types (wp_author before the posts that point at it, wp_comment after)
    const types = new Map<string, TypeInfo>();
    for (const [name, schema] of Object.entries(plan.schemas)) {
      let ct = await this.prisma.contentType.findUnique({ where: { name } });
      if (!ct) {
        try {
          ct = await this.contentTypes.create({ name, displayName: displayNameFor(postTypeOf(plan, name)), schema: schema as any });
          result.contentTypesCreated.push(name);
        } catch (err) {
          if (!(err instanceof ConflictException)) throw err;
          ct = await this.prisma.contentType.findUnique({ where: { name } }); // created meanwhile
        }
      }
      if (!ct) throw new Error(`Content type "${name}" could not be created`);
      const fields = (ct.schema as unknown as FieldDef[]) ?? [];
      types.set(name, { id: ct.id, fields: new Map(fields.map((f) => [f.name, f])) });
      result.byType[name] = { created: 0, updated: 0, skipped: 0, failed: 0 };
    }

    // 2. Media
    const urlMap = new Map<string, string>();
    if (payload.options.importMedia && plan.attachments.length) {
      const folderId = await this.mediaFolderId();
      let done = 0;
      for (const att of plan.attachments) {
        try {
          const outcome = await this.importAttachment(att.url, folderId, payload.actor);
          urlMap.set(att.url, outcome.url);
          result.media[outcome.reused ? 'reused' : 'imported']++;
        } catch (err: any) {
          result.media.failed++;
          addError(`Media ${att.url}: ${err?.message ?? err}`);
        }
        await beat({ phase: 'media', done: ++done, total: plan.attachments.length });
      }
    }

    // 3. Entries: authors, then posts (author_ref), then comments (post) — each
    // step records publicIds, created or already there, for the next one.
    const total = plan.authors.length + plan.entries.length + plan.comments.length;
    let done = 0;
    const write = async (item: WriteItem, label: string): Promise<string | undefined> => {
      const counts = result.byType[item.contentType];
      let publicId: string | undefined;
      try {
        const outcome = await this.writeEntry(item, types.get(item.contentType)!, locale, payload);
        counts[outcome.outcome]++;
        publicId = outcome.publicId;
      } catch (err: any) {
        counts.failed++;
        const detail = Array.isArray(err?.response?.errors) ? `: ${err.response.errors.join('; ')}` : '';
        addError(`${item.contentType}/${item.slug} (${label}): ${err?.message ?? err}${detail}`);
      }
      await beat({ phase: 'entries', done: ++done, total });
      return publicId;
    };

    const authorIds = new Map<string, string>();     // login → publicId
    for (const a of plan.authors) {
      const id = await write({ contentType: AUTHOR_TYPE, slug: a.slug, status: 'published', data: a.data }, `WordPress author ${a.login}`);
      if (id) authorIds.set(a.login, id);
    }

    const postIds = new Map<number, string>();       // WordPress post ID → publicId
    for (const entry of plan.entries) {
      const id = await write({
        contentType: entry.contentType,
        slug: entry.slug,
        status: entry.status,
        publishAt: entry.publishAt,
        date: entry.date,
        data: {
          ...entry.data,
          content: rewriteMediaUrls(entry.data.content, urlMap),
          featured_image: entry.data.featured_image
            ? { ...entry.data.featured_image, url: urlMap.get(entry.data.featured_image.url) ?? entry.data.featured_image.url }
            : undefined,
        },
        relations: entry.authorLogin ? { author_ref: [AUTHOR_TYPE, authorIds.get(entry.authorLogin)] } : undefined,
      }, `WordPress #${entry.wpId}`);
      if (id) postIds.set(entry.wpId, id);
    }

    for (const c of plan.comments) {
      await write({
        contentType: COMMENT_TYPE, slug: c.slug, status: c.status, date: c.date, data: c.data,
        relations: { post: [c.postContentType, postIds.get(c.data.post_wp_id)] },
      }, `WordPress comment #${c.wpId}`);
    }

    result.finishedAt = new Date().toISOString();
    await this.prisma.job.update({
      where: { id: job.id },
      data: { payload: { ...payload, progress: { phase: 'entries', done, total }, result } as any },
    });
    try { unlinkSync(path); } catch { /* already gone */ }
    this.logger.log(`WordPress import #${job.id}: ${JSON.stringify(result.byType)} media ${JSON.stringify(result.media)}`);
    return result;
  }

  /** Create the entry, or update/skip one with the same slug. Returns its publicId either way. */
  private async writeEntry(
    entry: WriteItem,
    ct: TypeInfo,
    locale: string,
    payload: ImportJobPayload,
  ): Promise<{ outcome: 'created' | 'updated' | 'skipped'; publicId?: string }> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry.data)) {
      const type = ct.fields.get(key)?.type;
      if (!type || value === undefined) continue; // existing type without this field
      const coerced = coerceForField(value, type);
      if (coerced !== undefined) data[key] = coerced;
    }
    // Relations the import resolved itself — only into a forward relation field to the right type.
    for (const [key, [target, id]] of Object.entries(entry.relations ?? {})) {
      const field = ct.fields.get(key) as any;
      if (!id || field?.type !== 'relation' || isReverseRelation(field) || field.options?.relatedContentType !== target) continue;
      data[key] = field.options?.cardinality === 'many' ? [id] : id;
    }

    const existing = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: ct.id, slug: entry.slug, locale } },
      select: { id: true, deletedAt: true, publicId: true },
    });
    const { actor } = payload;
    if (existing) {
      if (existing.deletedAt) throw new Error(`an entry with this slug is in the trash — restore or purge it first`);
      if (!payload.options.overwrite) return { outcome: 'skipped', publicId: existing.publicId };
      await this.entries.update(existing.id, {
        data, status: entry.status, publishAt: entry.publishAt ?? null,
      } as any, actor.id, actor.role ?? 'admin', 'import');
      return { outcome: 'updated', publicId: existing.publicId };
    }

    const created = await this.entries.create({
      contentTypeId: ct.id, slug: entry.slug, locale, status: entry.status, data,
      ...(entry.publishAt ? { publishAt: entry.publishAt } : {}),
    } as any, actor.id, actor.role ?? 'admin', 'import');
    // Keep WordPress' publish date as the entry's date (list order, feeds).
    if (entry.date) {
      await this.prisma.entry.update({ where: { id: created.id }, data: { createdAt: new Date(entry.date) } });
    }
    return { outcome: 'created', publicId: created.publicId };
  }

  /** Download one attachment into the media library (reusing an earlier import of it). */
  private async importAttachment(url: string, folderId: number, actor: ImportActor): Promise<{ url: string; reused: boolean }> {
    const original = basename(new URL(url).pathname) || 'file';
    const previous = await this.prisma.media.findFirst({ where: { folderId, originalName: original }, select: { url: true } });
    if (previous) return { url: previous.url, reused: true };

    mkdirSync(this.uploadsDir, { recursive: true });
    const stem = `${Date.now()}-${randomBytes(8).toString('hex')}`;
    const tmp = join(this.uploadsDir, `${stem}.download`);
    await safeDownload(url, tmp, this.downloadOptions);

    const mimetype = sniffMime(tmp);
    if (!mimetype) {
      try { unlinkSync(tmp); } catch { /* ignore */ }
      throw new DownloadError('file type not allowed (images, PDF and MP4 only)');
    }
    const filename = `${stem}${MIME_EXT[mimetype]}`;
    const path = join(this.uploadsDir, filename);
    renameSync(tmp, path);
    const record = await this.media.processUpload(
      { path, filename, originalname: original, mimetype, size: statSync(path).size } as Express.Multer.File,
      actor.id ? { id: actor.id, email: actor.email } : undefined,
    );
    await this.media.moveToFolder(record.filename, folderId);
    return { url: record.url, reused: false };
  }

  private async mediaFolderId(): Promise<number> {
    const existing = await this.prisma.mediaFolder.findFirst({ where: { name: MEDIA_FOLDER, parentId: null } });
    if (existing) return existing.id;
    try {
      return (await this.media.createFolder(MEDIA_FOLDER)).id;
    } catch {
      const again = await this.prisma.mediaFolder.findFirst({ where: { name: MEDIA_FOLDER, parentId: null } });
      if (!again) throw new Error(`Media folder "${MEDIA_FOLDER}" could not be created`);
      return again.id;
    }
  }

  private async defaultLocale(): Promise<string> {
    const setting = await this.prisma.setting.findUnique({ where: { id: 1 }, select: { defaultLocale: true } }).catch(() => null);
    return setting?.defaultLocale || 'en';
  }

  /** Remove import files left by failed or abandoned imports. */
  private pruneStaleFiles() {
    try {
      const cutoff = Date.now() - STALE_FILE_MS;
      for (const f of readdirSync(this.importsDir)) {
        if (extname(f) !== '.xml') continue;
        const p = join(this.importsDir, f);
        if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
      }
    } catch (err: any) {
      this.logger.warn(`Could not prune old import files: ${err?.message}`);
    }
  }
}

/** Everything an import writes, in order: authors, posts, comments. */
function planWrites(plan: ImportPlan): { contentType: string; slug: string; status: string }[] {
  return [
    ...plan.authors.map((a) => ({ contentType: AUTHOR_TYPE, slug: a.slug, status: 'published' })),
    ...plan.entries,
    ...plan.comments.map((c) => ({ contentType: COMMENT_TYPE, slug: c.slug, status: c.status })),
  ];
}

/** The WordPress side of a content type: its post type, or "author" / "comment". */
function postTypeOf(plan: ImportPlan, name: string): string {
  if (plan.contentTypes[name]) return plan.contentTypes[name];
  return name === AUTHOR_TYPE ? 'author' : name === COMMENT_TYPE ? 'comment' : name;
}

function displayNameFor(postType: string): string {
  if (postType === 'author') return 'WordPress Authors';
  if (postType === 'comment') return 'WordPress Comments';
  if (postType === 'post') return 'Posts';
  if (postType === 'page') return 'Pages';
  return postType.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Fit an imported value to an existing field of another type (e.g. a `post`
 * type whose `categories` is a text field). undefined = leave the field out.
 */
export function coerceForField(value: unknown, type: string): unknown {
  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
      if (Array.isArray(value)) return value.join(', ');
      if (value && typeof value === 'object') {
        const url = (value as any).url;
        return typeof url === 'string' ? url : Object.keys(value).length ? JSON.stringify(value) : undefined;
      }
      return undefined;
    case 'number':
      return typeof value === 'number' ? value : undefined;
    case 'image':
      return value && typeof value === 'object' && typeof (value as any).url === 'string' ? value : undefined;
    case 'datetime':
      return typeof value === 'string' && !isNaN(new Date(value).getTime()) ? value : undefined;
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
    case 'json':
      return value;
    default:
      return undefined; // select, relation, … — WordPress values can't be trusted to fit
  }
}
