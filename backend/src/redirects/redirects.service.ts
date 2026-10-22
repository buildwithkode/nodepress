import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { LocalesService } from '../locales/locales.service';
import { env } from '../config/env';
import {
  assertStatus, csvCell, findChainProblems, normalizeFrom, normalizeTo, parseRedirectCsv, RedirectEdge, targetKey,
} from './redirect-path';

const CACHE_PREFIX = 'redirects:';
const CACHE_TTL_MS = 5 * 60_000;
/** How often buffered hit counts are written (see recordHit). */
const HIT_FLUSH_MS = 10_000;
const MAX_IMPORT_ROWS = 10_000;

type CachedLookup = { id: number; to: string; statusCode: number } | { miss: true };

export interface RedirectInput {
  from?: unknown;
  to?: unknown;
  statusCode?: unknown;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ line: number; from: string; message: string }>;
  applied: boolean;
}

/** An entry as EntriesService.update sees it before and after the save. */
interface SlugChangeEntry {
  id: number;
  slug: string;
  status: string;
  locale?: string;
  contentType?: { name: string; previewUrl?: string | null } | null;
}

@Injectable()
export class RedirectsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedirectsService.name);
  /** Hits since the last flush, per redirect id. */
  private hits = new Map<number, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly locales: LocalesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flushHits(), HIT_FLUSH_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flushHits();
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────────────

  async list(query: { page?: number; limit?: number; search?: string; sort?: string }) {
    // Write this instance's buffered hits first so the admin sees them now (other
    // instances' hits arrive within HIT_FLUSH_MS).
    await this.flushHits().catch(() => undefined);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const search = query.search?.trim();
    const where: Prisma.RedirectWhereInput = search
      ? { OR: [{ from: { contains: search, mode: 'insensitive' } }, { to: { contains: search, mode: 'insensitive' } }] }
      : {};
    const orderBy: Prisma.RedirectOrderByWithRelationInput[] =
      query.sort === 'hits' ? [{ hits: 'desc' }, { id: 'desc' }]
      : query.sort === 'from' ? [{ from: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [data, total] = await Promise.all([
      this.prisma.redirect.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.redirect.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async create(input: RedirectInput) {
    const row = this.normalize(input);
    if (await this.prisma.redirect.findUnique({ where: { from: row.from } })) {
      throw new ConflictException(`A redirect from ${row.from} already exists`);
    }
    await this.assertNoChains([row]);
    const created = await this.prisma.redirect.create({ data: row });
    await this.clearCache();
    return created;
  }

  async update(id: number, input: RedirectInput) {
    const current = await this.prisma.redirect.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Redirect #${id} not found`);
    const row = this.normalize({
      from: input.from ?? current.from,
      to: input.to ?? current.to,
      statusCode: input.statusCode ?? current.statusCode,
    });
    if (row.from !== current.from) {
      const taken = await this.prisma.redirect.findUnique({ where: { from: row.from } });
      if (taken) throw new ConflictException(`A redirect from ${row.from} already exists`);
    }
    await this.assertNoChains([row], [current.from]);
    const updated = await this.prisma.redirect.update({ where: { id }, data: row });
    await this.clearCache();
    return updated;
  }

  async remove(id: number) {
    const current = await this.prisma.redirect.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Redirect #${id} not found`);
    await this.prisma.redirect.delete({ where: { id } });
    this.hits.delete(id);
    await this.clearCache();
    return { deleted: true, id };
  }

  /** Normalized { from, to, statusCode }, or a 400 explaining what's wrong. */
  normalize(input: RedirectInput) {
    const statusCode = assertStatus(input.statusCode ?? 301);
    return { from: normalizeFrom(input.from), to: normalizeTo(input.to, statusCode), statusCode };
  }

  /** Refuse loops and chains longer than MAX_CHAIN_HOPS once `rows` are written (and `removed` froms are gone). */
  private async assertNoChains(rows: RedirectEdge[], removed: string[] = []) {
    const problems = findChainProblems(await this.edgesWith(rows, removed), rows.map((r) => r.from));
    if (problems.size) throw new BadRequestException([...problems.values()][0]);
  }

  private async edgesWith(rows: RedirectEdge[], removed: string[] = []): Promise<RedirectEdge[]> {
    const map = new Map<string, string>();
    // Only path targets can chain; external URLs and 410s end a chain.
    const existing = await this.prisma.redirect.findMany({ where: { to: { startsWith: '/' } }, select: { from: true, to: true } });
    for (const e of existing) map.set(e.from, e.to);
    for (const f of removed) map.delete(f);
    for (const r of rows) map.set(r.from, r.to);
    return [...map].map(([from, to]) => ({ from, to }));
  }

  // ─── CSV import / export ───────────────────────────────────────────────────

  /**
   * Import `from,to,status` rows, adding new redirects and updating existing
   * ones (matched by `from`). All or nothing: any invalid row, loop or long
   * chain means nothing is written; a dry run only reports.
   */
  async importCsv(csv: string, dryRun: boolean): Promise<ImportReport> {
    if (typeof csv !== 'string' || !csv.trim()) throw new BadRequestException('The CSV is empty');
    const rows = parseRedirectCsv(csv);
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows per import`);

    const report: ImportReport = { dryRun, total: rows.length, created: 0, updated: 0, unchanged: 0, errors: [], applied: false };
    const valid = new Map<string, { line: number; from: string; to: string; statusCode: number }>();
    for (const r of rows) {
      try {
        const row = this.normalize({ from: r.from, to: r.to, statusCode: r.status || 301 });
        const dup = valid.get(row.from);
        if (dup) throw new BadRequestException(`${row.from} is also on line ${dup.line}`);
        valid.set(row.from, { line: r.line, ...row });
      } catch (err: any) {
        report.errors.push({ line: r.line, from: r.from, message: errorMessage(err) });
      }
    }

    const incoming = [...valid.values()];
    const problems = findChainProblems(await this.edgesWith(incoming), incoming.map((r) => r.from));
    for (const [from, message] of problems) report.errors.push({ line: valid.get(from)!.line, from, message });
    report.errors.sort((a, b) => a.line - b.line);

    const existing = new Map(
      (await this.prisma.redirect.findMany({ where: { from: { in: incoming.map((r) => r.from) } } })).map((r) => [r.from, r]),
    );
    const writes: Array<{ from: string; to: string; statusCode: number }> = [];
    for (const r of incoming) {
      const cur = existing.get(r.from);
      if (!cur) report.created++;
      else if (cur.to === r.to && cur.statusCode === r.statusCode) { report.unchanged++; continue; }
      else report.updated++;
      writes.push({ from: r.from, to: r.to, statusCode: r.statusCode });
    }

    if (dryRun || report.errors.length) return report;
    await this.prisma.$transaction(
      writes.map((w) => this.prisma.redirect.upsert({ where: { from: w.from }, create: w, update: { to: w.to, statusCode: w.statusCode } })),
    );
    await this.clearCache();
    report.applied = true;
    return report;
  }

  async exportCsv(): Promise<string> {
    const rows = await this.prisma.redirect.findMany({ orderBy: { from: 'asc' } });
    const lines = ['from,to,status,hits,last_hit_at'];
    for (const r of rows) {
      lines.push([r.from, r.to, r.statusCode, r.hits, r.lastHitAt?.toISOString() ?? ''].map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  // ─── Public resolve ────────────────────────────────────────────────────────

  /**
   * Where a public path redirects to, or null. A redirect with a query string
   * matches only that exact query; one without matches any query and the
   * request's query is carried over to a target that has none.
   */
  async resolve(rawPath: unknown): Promise<{ to: string | null; statusCode: number } | null> {
    let key: string;
    try {
      key = normalizeFrom(rawPath);
    } catch {
      return null;
    }
    const q = key.indexOf('?');
    const pathOnly = q >= 0 ? key.slice(0, q) : key;
    const query = q >= 0 ? key.slice(q) : '';

    let hit = await this.lookup(key);
    let matchedPathOnly = false;
    if (!hit && query) {
      hit = await this.lookup(pathOnly);
      matchedPathOnly = !!hit;
    }
    if (!hit) return null;

    this.recordHit(hit.id);
    if (hit.statusCode === 410) return { to: null, statusCode: 410 };
    let to = hit.to;
    if (matchedPathOnly && !/[?#]/.test(to)) to += query;
    return { to, statusCode: hit.statusCode };
  }

  private async lookup(key: string) {
    const cacheKey = `${CACHE_PREFIX}k:${key}`;
    const cached = await this.cache.get<CachedLookup>(cacheKey);
    if (cached) return 'miss' in cached ? null : cached;
    const row = await this.prisma.redirect.findUnique({ where: { from: key }, select: { id: true, to: true, statusCode: true } });
    // Most paths a site asks about aren't redirected, so misses are cached too.
    await this.cache.set<CachedLookup>(cacheKey, row ?? { miss: true }, CACHE_TTL_MS);
    return row;
  }

  /**
   * Count a hit without writing on the request path: hits are summed in memory
   * and written every HIT_FLUSH_MS in one UPDATE (and on shutdown). Increments
   * are additive, so several instances flushing their own buffers stay correct;
   * a crash loses at most the last few seconds of counts, which is fine for a
   * statistic.
   */
  recordHit(id: number) {
    this.hits.set(id, (this.hits.get(id) ?? 0) + 1);
  }

  async flushHits() {
    if (!this.hits.size) return;
    const batch = this.hits;
    this.hits = new Map();
    const ids = [...batch.keys()];
    const counts = ids.map((id) => batch.get(id)!);
    try {
      // "lastHitAt" is timestamp without time zone holding UTC.
      await this.prisma.$executeRaw`
        UPDATE "redirects" AS r
        SET "hits" = r."hits" + v.n, "lastHitAt" = (now() AT TIME ZONE 'UTC')
        FROM unnest(${ids}::int[], ${counts}::int[]) AS v(id, n)
        WHERE r."id" = v.id`;
    } catch (err: any) {
      this.logger.warn(`Could not save redirect hit counts: ${err?.message ?? err}`);
    }
  }

  /** Drop every cached lookup (writes call this). */
  clearCache() {
    return this.cache.invalidatePrefix(CACHE_PREFIX);
  }

  // ─── Automatic redirects on slug change ────────────────────────────────────

  /**
   * Called by EntriesService.update after a slug change. When the entry is or
   * was published, its old public path gets a 301 to the new one, and existing
   * redirects to the old path are pointed straight at the new one (no chains).
   * Never throws — a failed redirect must not fail the entry save.
   */
  async entrySlugChanged(before: SlugChangeEntry, after: { slug: string; status: string }) {
    try {
      if (env.REDIRECTS_ON_SLUG_CHANGE === 'false' || before.slug === after.slug || !before.contentType) return;
      const published = before.status === 'published' || after.status === 'published'
        || !!(await this.prisma.entryVersion.findFirst({ where: { entryId: before.id, status: 'published' }, select: { id: true } }));
      if (!published) return;

      const { defaultLocale } = await this.locales.get();
      const locale = before.locale ?? defaultLocale;
      const oldPath = publicEntryPath(before.contentType, before.slug, locale, defaultLocale);
      const newPath = publicEntryPath(before.contentType, after.slug, locale, defaultLocale);
      if (!oldPath || !newPath) return;
      await this.addMove(oldPath, newPath);
    } catch (err: any) {
      this.logger.warn(`Could not add a redirect for the slug change of entry #${before.id}: ${err?.message ?? err}`);
    }
  }

  /** 301 oldPath → newPath, re-pointing redirects that led to oldPath. */
  async addMove(oldPath: string, newPath: string) {
    const from = normalizeFrom(oldPath);
    const to = normalizeTo(newPath, 301);
    const newKey = targetKey(to)!;
    if (from === newKey) return;
    await this.prisma.$transaction(async (tx) => {
      // The new path is a live page again: a redirect away from it would hide it.
      await tx.redirect.deleteMany({ where: { from: newKey } });
      const pointing = await tx.redirect.findMany({ where: { to: { startsWith: '/' } }, select: { id: true, from: true, to: true } });
      for (const r of pointing) {
        if (targetKey(r.to) !== from) continue;
        if (r.from === newKey) await tx.redirect.delete({ where: { id: r.id } });
        else await tx.redirect.update({ where: { id: r.id }, data: { to } });
      }
      await tx.redirect.upsert({ where: { from }, create: { from, to, statusCode: 301 }, update: { to, statusCode: 301 } });
    });
    await this.clearCache();
  }
}

/**
 * The public path of an entry on the site. The CMS doesn't render the site, so:
 * a content type's previewUrl whose path contains {slug} (e.g.
 * "https://site.com/blog/{slug}?token={token}" → "/blog/<slug>") is used when
 * set; otherwise "/{type}/{slug}" with the type in kebab case (like the public
 * API path), prefixed with "/{locale}" for entries not in the default language.
 */
export function publicEntryPath(
  contentType: { name: string; previewUrl?: string | null },
  slug: string,
  locale: string,
  defaultLocale: string,
): string | null {
  const template = contentType.previewUrl?.trim();
  if (template) {
    const path = template.replace(/^https?:\/\/[^/?#]*/i, '').replace(/[?#].*$/, '') || '/';
    if (path.includes('{slug}') && !path.includes('{token}')) {
      return path.replace(/\{slug\}/g, encodeURIComponent(slug)).replace(/\{locale\}/g, encodeURIComponent(locale));
    }
  }
  const type = contentType.name.replace(/_/g, '-');
  return `${locale && locale !== defaultLocale ? `/${locale}` : ''}/${type}/${encodeURIComponent(slug)}`;
}

function errorMessage(err: any): string {
  const msg = err?.response?.message ?? err?.message ?? String(err);
  return Array.isArray(msg) ? msg.join(', ') : msg;
}
