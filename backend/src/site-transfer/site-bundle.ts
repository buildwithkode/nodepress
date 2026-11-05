import { randomUUID } from 'crypto';
import { assertValidSlug, canonicalLocale } from '../common/slug-locale.util';
import type { SiteEntryWrite } from '../entries/entries.service';

/** Marks a file as a site export (`GET /api/site/export`). */
export const SITE_BUNDLE_FORMAT = 'nodepress-site';
/** 2 adds users, roles, media records, settings, plugins, releases, submissions and history. */
export const SITE_BUNDLE_VERSION = 2;

const STATUSES = ['draft', 'published', 'archived'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SiteEntryRow {
  publicId?: string;
  slug: string;
  locale?: string;
  status?: string;
  data?: Record<string, unknown>;
  seo?: unknown;
  publishAt?: string | null;
  createdAt?: string;
  /** Set on an entry in the trash. */
  deletedAt?: string | null;
}

/** An entry already on this install. */
export interface ExistingEntry {
  id: number;
  publicId: string;
  type: string;
  slug: string;
  locale: string;
  deleted: boolean;
}

export interface TypePlan {
  name: string;
  total: number;
  toCreate: number;
  toUpdate: number;
  /** Matches an entry in the trash, which the import restores. */
  toRestore: number;
  /** Matches an existing entry that is kept as it is (overwrite off). */
  toSkip: number;
}

export interface EntryPlan {
  types: TypePlan[];
  writes: Map<string, SiteEntryWrite[]>;
  /** Bundle publicId → the publicId it has on this install, where they differ. */
  remapped: Map<string, string>;
  locales: Set<string>;
  errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Work out what a site import does with the bundle's entries, without writing.
 *
 * Entries are matched by content type + slug + locale. A matched entry keeps the
 * publicId it has here; a new one keeps the bundle's, unless another entry already
 * has it. Either way relation values (which hold publicIds) are rewritten to the
 * ids on this install, so relations between imported entries keep working.
 */
export function planEntries(
  bundleEntries: unknown,
  knownTypes: Set<string>,
  existing: ExistingEntry[],
  overwrite: boolean,
): EntryPlan {
  const plan: EntryPlan = { types: [], writes: new Map(), remapped: new Map(), locales: new Set(), errors: [] };
  if (bundleEntries === undefined || bundleEntries === null) return plan;
  if (!isObject(bundleEntries)) {
    plan.errors.push('"entries" must be an object of content type name → list of entries');
    return plan;
  }

  const byKey = new Map(existing.map((e) => [`${e.type}\u0000${e.slug}\u0000${e.locale}`, e]));
  const takenIds = new Set(existing.map((e) => e.publicId));
  const bundleIds = new Set<string>();
  const finalIds = new Map<string, string>();

  for (const [type, rows] of Object.entries(bundleEntries)) {
    const tp: TypePlan = { name: type, total: 0, toCreate: 0, toUpdate: 0, toRestore: 0, toSkip: 0 };
    plan.types.push(tp);
    if (!knownTypes.has(type)) {
      plan.errors.push(`entries.${type}: no content type named "${type}" in the file or on this site`);
      continue;
    }
    if (!Array.isArray(rows)) {
      plan.errors.push(`entries.${type}: must be a list of entries`);
      continue;
    }
    const writes: SiteEntryWrite[] = [];
    const seen = new Set<string>();
    tp.total = rows.length;

    rows.forEach((raw: unknown, i) => {
      const where = `entries.${type}[${i}]`;
      if (!isObject(raw)) {
        plan.errors.push(`${where}: must be an object`);
        return;
      }
      const row = raw as unknown as SiteEntryRow;
      let locale: string;
      try {
        locale = canonicalLocale(row.locale);
      } catch (err: any) {
        plan.errors.push(`${where}: ${err.message}`);
        return;
      }
      const label = `${where} "${String(row.slug)}" (${locale})`;
      if (typeof row.slug !== 'string' || !row.slug) {
        plan.errors.push(`${where}: missing slug`);
        return;
      }
      const status = row.status ?? 'draft';
      if (!STATUSES.includes(status)) {
        plan.errors.push(`${label}: status must be draft, published or archived`);
        return;
      }
      if (row.data !== undefined && !isObject(row.data)) {
        plan.errors.push(`${label}: data must be an object`);
        return;
      }
      if (row.publishAt && Number.isNaN(Date.parse(row.publishAt))) {
        plan.errors.push(`${label}: publishAt is not a date`);
        return;
      }
      if ((row.createdAt && Number.isNaN(Date.parse(row.createdAt))) || (row.deletedAt && Number.isNaN(Date.parse(row.deletedAt)))) {
        plan.errors.push(`${label}: createdAt and deletedAt must be dates`);
        return;
      }
      if (row.publicId !== undefined && (typeof row.publicId !== 'string' || !UUID.test(row.publicId))) {
        plan.errors.push(`${label}: publicId must be a UUID`);
        return;
      }
      if (row.publicId) {
        if (bundleIds.has(row.publicId)) {
          plan.errors.push(`${label}: publicId ${row.publicId} appears twice in the file`);
          return;
        }
        bundleIds.add(row.publicId);
      }
      const key = `${type}\u0000${row.slug}\u0000${locale}`;
      if (seen.has(key)) {
        plan.errors.push(`${label}: appears twice in the file`);
        return;
      }
      seen.add(key);
      plan.locales.add(locale);

      const match = byKey.get(key);
      if (match) {
        if (row.publicId && row.publicId !== match.publicId) finalIds.set(row.publicId, match.publicId);
        // Something in the file's trash never removes or replaces what's on this site.
        if (row.deletedAt) {
          tp.toSkip++;
          return;
        }
        if (!overwrite && !match.deleted) {
          tp.toSkip++;
          return;
        }
        if (match.deleted) tp.toRestore++;
        else tp.toUpdate++;
        writes.push(toWrite(row, locale, status, match.publicId, match.id));
        return;
      }

      try {
        assertValidSlug(row.slug);
      } catch (err: any) {
        plan.errors.push(`${label}: ${err.message}`);
        return;
      }
      let publicId = row.publicId && !takenIds.has(row.publicId) ? row.publicId : randomUUID();
      while (takenIds.has(publicId)) publicId = randomUUID();
      takenIds.add(publicId);
      if (row.publicId && row.publicId !== publicId) finalIds.set(row.publicId, publicId);
      tp.toCreate++;
      writes.push(toWrite(row, locale, status, publicId));
    });
    plan.writes.set(type, writes);
  }

  plan.remapped = finalIds;
  if (finalIds.size) {
    for (const writes of plan.writes.values()) {
      for (const w of writes) w.data = remapIds(w.data, finalIds) as Record<string, any>;
    }
  }
  return plan;
}

function toWrite(row: SiteEntryRow, locale: string, status: string, publicId: string, existingId?: number): SiteEntryWrite {
  return {
    existingId,
    publicId,
    slug: row.slug,
    locale,
    status,
    data: (row.data ?? {}) as Record<string, any>,
    seo: row.seo ?? null,
    publishAt: row.publishAt ?? null,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt ?? null,
  };
}

/** A webhook to create or, with `id`, update. */
export interface SiteWebhookWrite {
  id?: number;
  name: string;
  url: string;
  /** Left undefined on an update when the file carries no secret: the one here stays. */
  secret?: string | null;
  events: string[];
  enabled?: boolean;
}

export interface WebhookPlan {
  total: number;
  toCreate: number;
  toUpdate: number;
  /** Matches an existing webhook that is kept as it is (overwrite off). */
  toSkip: number;
  /** Addresses that receive events once the import has run. */
  active: string[];
  /** New webhooks left switched off: the file has no secret for them. */
  switchedOff: number;
  writes: SiteWebhookWrite[];
  errors: string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Work out what a site import does with the bundle's webhooks. They have no unique
 * key, so they are matched by name + URL. Any http(s) URL is accepted here, because
 * a site's own webhook may point at localhost; every delivery still goes through
 * the private-address check in `outboundPost`.
 */
export function planWebhooks(
  bundleWebhooks: unknown,
  existing: Array<{ id: number; name: string; url: string }>,
  overwrite: boolean,
): WebhookPlan {
  const plan: WebhookPlan = { total: 0, toCreate: 0, toUpdate: 0, toSkip: 0, active: [], switchedOff: 0, writes: [], errors: [] };
  if (bundleWebhooks === undefined || bundleWebhooks === null) return plan;
  if (!Array.isArray(bundleWebhooks)) {
    plan.errors.push('"webhooks" must be a list of webhooks');
    return plan;
  }
  plan.total = bundleWebhooks.length;
  const keyOf = (name: string, url: string) => `${name}\u0000${url}`;
  const byKey = new Map<string, number>();
  // Oldest first wins when a site has two webhooks with the same name and URL.
  for (const e of [...existing].reverse()) byKey.set(keyOf(e.name, e.url), e.id);
  const seen = new Set<string>();

  bundleWebhooks.forEach((row: unknown, i) => {
    const where = `webhooks[${i}]`;
    if (!isObject(row)) {
      plan.errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof row.name !== 'string' || !row.name.trim()) {
      plan.errors.push(`${where}: missing name`);
      return;
    }
    const label = `${where} "${row.name}"`;
    if (typeof row.url !== 'string' || !isHttpUrl(row.url)) {
      plan.errors.push(`${label}: url must be an http(s) URL`);
      return;
    }
    if (!Array.isArray(row.events) || !row.events.length || !row.events.every((e) => typeof e === 'string')) {
      plan.errors.push(`${label}: events must be a list of event names`);
      return;
    }
    if (row.secret !== undefined && row.secret !== null && typeof row.secret !== 'string') {
      plan.errors.push(`${label}: secret must be text`);
      return;
    }
    if (row.enabled !== undefined && typeof row.enabled !== 'boolean') {
      plan.errors.push(`${label}: enabled must be true or false`);
      return;
    }
    const key = keyOf(row.name, row.url);
    if (seen.has(key)) {
      plan.errors.push(`${label}: appears twice in the file with the same URL`);
      return;
    }
    seen.add(key);

    const id = byKey.get(key);
    if (id !== undefined && !overwrite) {
      plan.toSkip++;
      return;
    }
    // Exports no longer carry signing secrets. Without one a new webhook stays off until
    // someone sets it, and an existing one keeps its own secret and on/off state.
    const hasSecret = row.secret !== undefined;
    const write: SiteWebhookWrite = {
      id,
      name: row.name,
      url: row.url,
      secret: hasSecret ? (row.secret as string | null) : id === undefined ? null : undefined,
      events: row.events as string[],
      enabled: hasSecret ? ((row.enabled as boolean | undefined) ?? true) : id === undefined ? false : undefined,
    };
    if (id === undefined) plan.toCreate++;
    else plan.toUpdate++;
    if (!hasSecret && id === undefined) plan.switchedOff++;
    plan.writes.push(write);
    if (write.enabled && !plan.active.includes(write.url)) plan.active.push(write.url);
  });
  return plan;
}

/**
 * Replace every string that is exactly an old publicId with the new one, at any depth
 * (relation fields inside groups, repeaters and flexible sections included). UUIDs
 * don't occur by accident, so other values are left alone; object keys never change.
 */
export function remapIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, ids));
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapIds(v, ids);
    return out;
  }
  return value;
}

/**
 * Point media links at this site: every `<old site>/uploads/` in any string becomes
 * `<this site>/uploads/`, at any depth, rich text included. Files on R2, S3 or ImageKit
 * have their own addresses and are left alone, as are object keys.
 */
export function rewriteBaseUrl(value: unknown, from: unknown, to: unknown): unknown {
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) return value;
  const oldBase = `${from.replace(/\/+$/, '')}/uploads/`;
  const newBase = `${to.replace(/\/+$/, '')}/uploads/`;
  if (oldBase === newBase) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.split(oldBase).join(newBase);
    if (Array.isArray(v)) return v.map(walk);
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
