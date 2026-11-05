import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { EntriesService } from '../entries/entries.service';
import { LocalesService, validateLocales } from '../locales/locales.service';
import { NODEPRESS_VERSION } from '../plugin/plugin.registry';
import { contentTypeName } from '../common/content-type-name';
import { RedirectsService } from '../redirects/redirects.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { env } from '../config/env';
import { ExistingEntry, planEntries, planWebhooks, remapIds, rewriteBaseUrl, SITE_BUNDLE_FORMAT, SITE_BUNDLE_VERSION } from './site-bundle';
import { ExtraNote, SiteExtrasService } from './site-extras.service';
import { FormsService } from '../forms/forms.service';
import { planForms } from '../forms/form-import';

export interface SiteImportOptions {
  dryRun?: boolean;
  /** Update existing content types, entries, forms, webhooks and redirects (default). Off: keep them as they are. */
  overwrite?: boolean;
  /** Signed in as an admin. An API key only reaches the content sections. */
  admin?: boolean;
}

/** Sections an API key can't read or write: a full-access key must not become an admin login. */
const ADMIN_SECTIONS = ['brand', 'settings', 'roles', 'permissions', 'roleAccess', 'users', 'mediaFolders', 'media', 'plugins', 'pluginPackages', 'releases', 'formSubmissions', 'entryVersions', 'schemaVersions', 'auditLog'];

/** Form webhook headers often hold API tokens, so a site export leaves them out. */
function withoutHeaders(actions: unknown) {
  if (!Array.isArray(actions)) return actions;
  return actions.map((a: any) => {
    if (!a || a.type !== 'webhook' || !a.headers || !Object.keys(a.headers).length) return a;
    const { headers: _headers, ...rest } = a;
    return { ...rest, headersRemoved: true };
  });
}

/**
 * Whole-site export and import, in one JSON file: the content model, every entry
 * (all locales, all statuses, the trash), forms, webhooks, redirects, and, for an
 * admin, everything in SiteExtrasService. Media files are copied by hand. The file
 * holds no credentials: no passwords, API keys, webhook secrets or form webhook headers.
 */
@Injectable()
export class SiteTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTypes: ContentTypeService,
    private readonly entries: EntriesService,
    private readonly locales: LocalesService,
    private readonly forms: FormsService,
    private readonly webhooks: WebhooksService,
    private readonly redirects: RedirectsService,
    private readonly extras: SiteExtrasService,
  ) {}

  async export(opts: { admin?: boolean } = {}) {
    const schemas = await this.contentTypes.exportSchemas();
    const types = await this.prisma.contentType.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const rows = await this.prisma.entry.findMany({
      orderBy: [{ contentTypeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { contentTypeId: true, publicId: true, slug: true, locale: true, status: true, data: true, seo: true, publishAt: true, createdAt: true, deletedAt: true },
    });
    const entries: Record<string, unknown[]> = {};
    for (const t of types) entries[t.name] = [];
    const nameOf = new Map(types.map((t) => [t.id, t.name]));
    for (const { contentTypeId, deletedAt, ...row } of rows) entries[nameOf.get(contentTypeId)!].push(deletedAt ? { ...row, deletedAt } : row);
    const forms = (await this.forms.exportRows()).map((f) => ({ ...f, actions: withoutHeaders(f.actions) }));
    const webhooks = await this.prisma.webhook.findMany({
      orderBy: { id: 'asc' },
      select: { name: true, url: true, events: true, enabled: true },
    });
    const redirects = await this.prisma.redirect.findMany({
      orderBy: { from: 'asc' },
      select: { from: true, to: true, statusCode: true },
    });

    return {
      format: SITE_BUNDLE_FORMAT,
      version: SITE_BUNDLE_VERSION,
      nodepressVersion: NODEPRESS_VERSION,
      exportedAt: new Date().toISOString(),
      locales: await this.locales.get(),
      choiceLists: schemas.choiceLists,
      components: schemas.components,
      contentTypes: schemas.contentTypes,
      entries,
      forms,
      webhooks,
      redirects,
      ...(opts.admin ? await this.extras.export() : { partial: true }),
    };
  }

  async import(bundle: any, opts: SiteImportOptions = {}, actorId?: number) {
    if (!bundle || typeof bundle !== 'object' || bundle.format !== SITE_BUNDLE_FORMAT) {
      throw new BadRequestException(`Not a NodePress site export (expected "format": "${SITE_BUNDLE_FORMAT}")`);
    }
    if (typeof bundle.version !== 'number' || bundle.version > SITE_BUNDLE_VERSION) {
      throw new BadRequestException(`This site export uses format version ${bundle.version}; this NodePress reads up to ${SITE_BUNDLE_VERSION}`);
    }
    const dryRun = !!opts.dryRun;
    const overwrite = opts.overwrite !== false;
    const errors: string[] = [];
    const accessNotes: ExtraNote[] = [];
    if (!opts.admin) {
      const dropped = ADMIN_SECTIONS.filter((k) => bundle[k] !== undefined && bundle[k] !== null);
      if (dropped.length) accessNotes.push({ code: 'adminOnly', list: dropped.join(', '), message: `Skipped because an API key can't import them, only a signed-in admin: ${dropped.join(', ')}.` });
    }

    // ── Content model ──
    const contentTypes = Array.isArray(bundle.contentTypes) ? bundle.contentTypes : [];
    const schemaPayload = {
      contentTypes,
      components: bundle.components,
      choiceLists: bundle.choiceLists,
      overwrite,
    };
    const schemas = contentTypes.length
      ? await this.contentTypes.importSchemas({ ...schemaPayload, dryRun: true })
      : null;
    if (schemas) errors.push(...schemas.errors);

    // ── Entries ──
    const existingTypes = await this.prisma.contentType.findMany({ select: { id: true, name: true } });
    const known = new Set([
      ...existingTypes.map((t) => t.name),
      ...contentTypes.map((t: any) => contentTypeName(String(t?.name ?? ''))).filter(Boolean),
    ]);
    const typeNames = bundle.entries && typeof bundle.entries === 'object' ? Object.keys(bundle.entries) : [];
    const existing = await this.existingEntries(existingTypes.filter((t) => typeNames.includes(t.name)));
    const plan = planEntries(bundle.entries, known, existing, overwrite);
    errors.push(...plan.errors);

    // ── Forms ──
    const existingForms = await this.prisma.form.findMany({ select: { slug: true } });
    const formsFile = await this.keepHeaders(bundle.forms);
    const formPlan = planForms(formsFile.forms, new Set(existingForms.map((f) => f.slug)), overwrite);
    errors.push(...formPlan.errors);
    const { total: formTotal, toCreate: formsToCreate, toUpdate: formsToUpdate, toSkip: formsToSkip } = formPlan;

    // ── Webhooks ──
    const existingWebhooks = await this.prisma.webhook.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, url: true } });
    const webhookPlan = planWebhooks(bundle.webhooks, existingWebhooks, overwrite);
    errors.push(...webhookPlan.errors);

    // ── Redirects ──
    const redirectPlan = await this.redirects.planSiteRedirects(bundle.redirects, overwrite);
    errors.push(...redirectPlan.errors);

    // ── Languages: add the file's languages that this site doesn't have yet ──
    const current = await this.locales.get();
    const fileLocales = Array.isArray(bundle.locales?.locales) ? bundle.locales.locales : [];
    const localesToAdd = [...new Set([...fileLocales.map(String), ...plan.locales])].filter((l) => !current.locales.includes(l));
    let nextLocales: string[] | null = null;
    // A site's main language follows the file too, unless existing content is being kept.
    const fileDefault = typeof bundle.locales?.defaultLocale === 'string' ? bundle.locales.defaultLocale : null;
    const nextDefault = overwrite && fileDefault && fileDefault !== current.defaultLocale ? fileDefault : current.defaultLocale;
    if (localesToAdd.length || nextDefault !== current.defaultLocale) {
      try {
        nextLocales = validateLocales({ defaultLocale: nextDefault, locales: [...current.locales, ...localesToAdd] }).locales;
      } catch (err: any) {
        errors.push(`Languages: ${err?.response?.message ?? err.message}`);
      }
    }

    const sum = (k: 'total' | 'toCreate' | 'toUpdate' | 'toRestore' | 'toSkip') => plan.types.reduce((n, t) => n + t[k], 0);
    const entrySummary = {
      total: sum('total'),
      toCreate: sum('toCreate'),
      toUpdate: sum('toUpdate'),
      toRestore: sum('toRestore'),
      toSkip: sum('toSkip'),
      relinked: plan.remapped.size,
      types: plan.types,
    };

    // ── Media links, then everything only an admin may see ──
    const siteUrl = bundle.siteUrl;
    const movesMedia = typeof siteUrl === 'string' && !!env.APP_URL && siteUrl.replace(/\/+$/, '') !== env.APP_URL.replace(/\/+$/, '');
    if (movesMedia) {
      for (const writes of plan.writes.values()) {
        for (const w of writes) {
          w.data = rewriteBaseUrl(w.data, siteUrl, env.APP_URL) as Record<string, any>;
          w.seo = rewriteBaseUrl(w.seo, siteUrl, env.APP_URL);
        }
      }
    }
    const extras = await this.extras.plan(opts.admin ? bundle : { siteUrl }, {
      overwrite,
      remapped: plan.remapped,
      entryIds: new Set([...plan.writes.values()].flat().map((w) => w.publicId)),
      formSlugs: new Set([...existingForms.map((f) => f.slug), ...(Array.isArray(bundle.forms) ? bundle.forms.map((f: any) => f?.slug) : [])]),
      contentTypeNames: known,
      applyIdRemap: (v) => (plan.remapped.size ? remapIds(v, plan.remapped) : v),
    });
    errors.push(...extras.errors);
    const notes: ExtraNote[] = [...accessNotes, ...extras.notes];
    if (webhookPlan.switchedOff) notes.push({ code: 'webhooksOff', count: webhookPlan.switchedOff, message: `${webhookPlan.switchedOff} new webhook(s) stay switched off until you set a signing secret and turn them on.` });
    if (formsFile.headersMissing) notes.push({ code: 'formHeaders', count: formsFile.headersMissing, message: `${formsFile.headersMissing} form webhook action(s) need their headers entered again.` });
    // Files on R2, S3 or ImageKit have their own addresses: only say so when a link really moves.
    if (movesMedia && JSON.stringify([bundle.entries, opts.admin ? [bundle.media, bundle.brand] : null]).includes(`${siteUrl.replace(/\/+$/, '')}/uploads/`)) notes.push({ code: 'mediaLinks', list: `${siteUrl} → ${env.APP_URL}`, message: `Media links will change from ${siteUrl} to ${env.APP_URL}.` });
    if (nextDefault !== current.defaultLocale) notes.push({ code: 'defaultLocale', list: nextDefault, message: `The main language will change to ${nextDefault}.` });

    if (dryRun) {
      return {
        dryRun: true,
        extras: extras.counts,
        notes,
        valid: errors.length === 0,
        errors,
        schemas,
        entries: entrySummary,
        forms: { total: formTotal, toCreate: formsToCreate, toUpdate: formsToUpdate, toSkip: formsToSkip },
        webhooks: {
          total: webhookPlan.total,
          toCreate: webhookPlan.toCreate,
          toUpdate: webhookPlan.toUpdate,
          toSkip: webhookPlan.toSkip,
          active: webhookPlan.active,
        },
        redirects: {
          total: redirectPlan.total,
          toCreate: redirectPlan.toCreate,
          toUpdate: redirectPlan.toUpdate,
          toSkip: redirectPlan.toSkip,
        },
        localesToAdd,
      };
    }
    // All or nothing: nothing is written while the file has a problem.
    if (errors.length) throw new BadRequestException({ message: 'Import aborted — nothing was changed', errors });

    if (nextLocales) await this.locales.update({ defaultLocale: nextDefault, locales: nextLocales });
    const schemaResult = contentTypes.length ? await this.contentTypes.importSchemas(schemaPayload, actorId) : null;

    const ids = new Map((await this.prisma.contentType.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]));
    let created = 0;
    let updated = 0;
    const writeErrors: string[] = [];
    for (const [type, writes] of plan.writes) {
      if (!writes.length) continue;
      const r = await this.entries.writeSiteEntries(ids.get(type)!, writes, actorId);
      created += r.created;
      updated += r.updated;
      writeErrors.push(...r.errors);
    }

    const { errors: formErrors, ...formsResult } = await this.forms.writeImported(formPlan.creates, formPlan.updates);
    writeErrors.push(...formErrors);
    try {
      await this.redirects.writeSiteRedirects(redirectPlan.writes);
    } catch (err: any) {
      redirectPlan.toCreate = redirectPlan.toUpdate = 0;
      writeErrors.push(`Redirects: ${err.message}`);
    }
    // Last, once everything else is in place.
    const { errors: webhookErrors, ...webhooksResult } = await this.webhooks.writeSiteWebhooks(webhookPlan.writes);
    writeErrors.push(...webhookErrors);

    const extrasResult = await extras.write();
    writeErrors.push(...extrasResult.errors);

    return {
      extras: extrasResult.written,
      notes,
      schemas: schemaResult,
      entries: { created, updated, skipped: entrySummary.toSkip, relinked: entrySummary.relinked },
      forms: { ...formsResult, skipped: formsToSkip },
      webhooks: { ...webhooksResult, skipped: webhookPlan.toSkip },
      redirects: { created: redirectPlan.toCreate, updated: redirectPlan.toUpdate, skipped: redirectPlan.toSkip },
      localesAdded: nextLocales ? localesToAdd : [],
      errors: writeErrors,
    };
  }

  /**
   * Exports leave form webhook headers out, so an update must not wipe the ones saved
   * here: the same action (type + URL) keeps its headers. Also drops the export's marker.
   */
  private async keepHeaders(forms: unknown): Promise<{ forms: unknown; headersMissing: number }> {
    if (!Array.isArray(forms)) return { forms, headersMissing: 0 };
    const saved = new Map((await this.prisma.form.findMany({ select: { slug: true, actions: true } })).map((f) => [f.slug, f.actions as any[]]));
    let headersMissing = 0;
    const out = forms.map((form: any) => {
      if (!form || !Array.isArray(form.actions)) return form;
      const actions = form.actions.map((a: any) => {
        if (!a?.headersRemoved) return a;
        const { headersRemoved: _marker, ...rest } = a;
        const match = (saved.get(form.slug) ?? []).find((s: any) => s?.type === a.type && s?.url === a.url && s?.headers);
        if (match) return { ...rest, headers: match.headers };
        headersMissing++;
        return rest;
      });
      return { ...form, actions };
    });
    return { forms: out, headersMissing };
  }

  private async existingEntries(types: Array<{ id: number; name: string }>): Promise<ExistingEntry[]> {
    if (!types.length) return [];
    const nameOf = new Map(types.map((t) => [t.id, t.name]));
    const rows = await this.prisma.entry.findMany({
      where: { contentTypeId: { in: types.map((t) => t.id) } },
      select: { id: true, publicId: true, contentTypeId: true, slug: true, locale: true, deletedAt: true },
    });
    // publicIds are unique across every type, so collisions are checked against all of them.
    const others = await this.prisma.entry.findMany({
      where: { contentTypeId: { notIn: types.map((t) => t.id) } },
      select: { id: true, publicId: true },
    });
    return [
      ...rows.map((r) => ({ id: r.id, publicId: r.publicId, type: nameOf.get(r.contentTypeId)!, slug: r.slug, locale: r.locale, deleted: !!r.deletedAt })),
      // Never matched (no type), only reserve their publicIds.
      ...others.map((r) => ({ id: r.id, publicId: r.publicId, type: '', slug: '', locale: '', deleted: false })),
    ];
  }
}
