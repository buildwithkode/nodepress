import { isReservedFormSlug, normalizeFormSlug } from './form-slug';

/** Marks a file as a forms export (`GET /api/forms/export`). */
export const FORMS_FILE_FORMAT = 'nodepress-forms';
export const FORMS_FILE_VERSION = 1;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A form to create or update. Its submissions are never in the file and stay untouched. */
export interface SiteFormWrite {
  slug: string;
  name: string;
  fields: unknown[];
  actions: unknown[];
  isActive: boolean;
  captchaEnabled: boolean;
}

export interface FormPlan {
  total: number;
  toCreate: number;
  toUpdate: number;
  /** Matches an existing form that is kept as it is (overwrite off). */
  toSkip: number;
  creates: SiteFormWrite[];
  updates: SiteFormWrite[];
  errors: string[];
}

/** Work out what an import does with a file's forms, matched by slug. Site exports from before forms were included have none. */
export function planForms(fileForms: unknown, existingSlugs: Set<string>, overwrite: boolean): FormPlan {
  const plan: FormPlan = { total: 0, toCreate: 0, toUpdate: 0, toSkip: 0, creates: [], updates: [], errors: [] };
  if (fileForms === undefined || fileForms === null) return plan;
  if (!Array.isArray(fileForms)) {
    plan.errors.push('"forms" must be a list of forms');
    return plan;
  }
  plan.total = fileForms.length;
  const seen = new Set<string>();

  fileForms.forEach((row: unknown, i) => {
    const where = `forms[${i}]`;
    if (!isObject(row)) {
      plan.errors.push(`${where}: must be an object`);
      return;
    }
    const slug = typeof row.slug === 'string' ? normalizeFormSlug(row.slug) : '';
    if (!slug) {
      plan.errors.push(`${where}: missing slug`);
      return;
    }
    const label = `${where} "${slug}"`;
    if (isReservedFormSlug(slug)) {
      plan.errors.push(`${label}: "${slug}" is a reserved slug`);
      return;
    }
    if (seen.has(slug)) {
      plan.errors.push(`${label}: appears twice in the file`);
      return;
    }
    seen.add(slug);
    if (typeof row.name !== 'string' || !row.name.trim()) {
      plan.errors.push(`${label}: missing name`);
      return;
    }
    if (!Array.isArray(row.fields) || !row.fields.every(isObject)) {
      plan.errors.push(`${label}: fields must be a list of objects`);
      return;
    }
    const actions = row.actions ?? [];
    if (!Array.isArray(actions) || !actions.every(isObject)) {
      plan.errors.push(`${label}: actions must be a list of objects`);
      return;
    }
    for (const flag of ['isActive', 'captchaEnabled']) {
      if (row[flag] !== undefined && typeof row[flag] !== 'boolean') {
        plan.errors.push(`${label}: ${flag} must be true or false`);
        return;
      }
    }

    const write: SiteFormWrite = {
      slug,
      name: row.name,
      fields: row.fields,
      actions,
      isActive: (row.isActive as boolean | undefined) ?? true,
      captchaEnabled: (row.captchaEnabled as boolean | undefined) ?? false,
    };
    if (!existingSlugs.has(slug)) {
      plan.toCreate++;
      plan.creates.push(write);
    } else if (overwrite) {
      plan.toUpdate++;
      plan.updates.push(write);
    } else {
      plan.toSkip++;
    }
  });
  return plan;
}
