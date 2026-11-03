import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { EntriesService } from '../entries/entries.service';
import { LocalesService, validateLocales } from '../locales/locales.service';
import { NODEPRESS_VERSION } from '../plugin/plugin.registry';
import { contentTypeName } from '../common/content-type-name';
import { ExistingEntry, planEntries, planForms, SITE_BUNDLE_FORMAT, SITE_BUNDLE_VERSION, SiteFormWrite } from './site-bundle';

export interface SiteImportOptions {
  dryRun?: boolean;
  /** Update existing content types, entries and forms (default). Off: keep them as they are. */
  overwrite?: boolean;
}

/**
 * Whole-site export and import: choice lists, components, content types, every
 * entry (all locales, all statuses) and forms in one JSON file. Media files and form
 * submissions are not included; entries keep their media URLs.
 */
@Injectable()
export class SiteTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTypes: ContentTypeService,
    private readonly entries: EntriesService,
    private readonly locales: LocalesService,
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
    const forms = await this.prisma.form.findMany({
      orderBy: { slug: 'asc' },
      select: { name: true, slug: true, fields: true, actions: true, isActive: true, captchaEnabled: true },
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

    const formsResult = await this.writeForms(formPlan.creates, formPlan.updates, writeErrors);

    return {
      schemas: schemaResult,
      entries: { created, updated, skipped: entrySummary.toSkip, relinked: entrySummary.relinked },
      forms: { ...formsResult, skipped: formsToSkip },
      localesAdded: nextLocales ? localesToAdd : [],
      errors: writeErrors,
    };
  }

  /** Updates in place, so a form keeps its id and its submissions. */
  private async writeForms(creates: SiteFormWrite[], updates: SiteFormWrite[], errors: string[]) {
    const counts = { created: 0, updated: 0 };
    const write = async (form: SiteFormWrite, isNew: boolean) => {
      const { slug, ...values } = form;
      const data = { ...values, fields: values.fields as Prisma.InputJsonValue, actions: values.actions as Prisma.InputJsonValue };
      try {
        if (isNew) await this.prisma.form.create({ data: { slug, ...data } });
        else await this.prisma.form.update({ where: { slug }, data });
        counts[isNew ? 'created' : 'updated']++;
      } catch (err: any) {
        errors.push(`Form "${slug}": ${err.message}`);
      }
    };
    for (const form of creates) await write(form, true);
    for (const form of updates) await write(form, false);
    return counts;
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
