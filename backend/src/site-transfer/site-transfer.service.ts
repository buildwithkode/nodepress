import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { EntriesService } from '../entries/entries.service';
import { LocalesService, validateLocales } from '../locales/locales.service';
import { NODEPRESS_VERSION } from '../plugin/plugin.registry';
import { contentTypeName } from '../common/content-type-name';
import { RedirectsService } from '../redirects/redirects.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ExistingEntry, planEntries, planWebhooks, SITE_BUNDLE_FORMAT, SITE_BUNDLE_VERSION } from './site-bundle';
import { FormsService } from '../forms/forms.service';
import { planForms } from '../forms/form-import';

export interface SiteImportOptions {
  dryRun?: boolean;
  /** Update existing content types, entries, forms, webhooks and redirects (default). Off: keep them as they are. */
  overwrite?: boolean;
}

/**
 * Whole-site export and import: choice lists, components, content types, every
 * entry (all locales, all statuses), forms, webhooks and redirects in one JSON file.
 * Media files, form submissions, webhook deliveries and redirect hit counts are not
 * included; entries keep their media URLs.
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
  ) {}

  async export() {
    const schemas = await this.contentTypes.exportSchemas();
    const types = await this.prisma.contentType.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const rows = await this.prisma.entry.findMany({
      where: { deletedAt: null },
      orderBy: [{ contentTypeId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { contentTypeId: true, publicId: true, slug: true, locale: true, status: true, data: true, seo: true, publishAt: true },
    });
    const entries: Record<string, unknown[]> = {};
    for (const t of types) entries[t.name] = [];
    const nameOf = new Map(types.map((t) => [t.id, t.name]));
    for (const { contentTypeId, ...row } of rows) entries[nameOf.get(contentTypeId)!].push(row);
    const forms = await this.forms.exportRows();
    const webhooks = await this.prisma.webhook.findMany({
      orderBy: { id: 'asc' },
      select: { name: true, url: true, secret: true, events: true, enabled: true },
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
    const formPlan = planForms(bundle.forms, new Set(existingForms.map((f) => f.slug)), overwrite);
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
    if (localesToAdd.length) {
      try {
        nextLocales = validateLocales({ defaultLocale: current.defaultLocale, locales: [...current.locales, ...localesToAdd] }).locales;
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

    if (dryRun) {
      return {
        dryRun: true,
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

    if (nextLocales) await this.locales.update({ defaultLocale: current.defaultLocale, locales: nextLocales });
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

    return {
      schemas: schemaResult,
      entries: { created, updated, skipped: entrySummary.toSkip, relinked: entrySummary.relinked },
      forms: { ...formsResult, skipped: formsToSkip },
      webhooks: { ...webhooksResult, skipped: webhookPlan.toSkip },
      redirects: { created: redirectPlan.toCreate, updated: redirectPlan.toUpdate, skipped: redirectPlan.toSkip },
      localesAdded: nextLocales ? localesToAdd : [],
      errors: writeErrors,
    };
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
