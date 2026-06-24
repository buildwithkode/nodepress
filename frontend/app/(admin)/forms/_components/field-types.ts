// Shared field model + helpers for the form builder (Phase 2 — rich nested types).
// Mirrors backend/src/forms/types/form-field.types.ts.

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'url' | 'phone'
  | 'date' | 'datetime' | 'boolean'
  | 'select' | 'radio' | 'multiselect' | 'tags'
  | 'group' | 'repeater';

export interface FieldValidation {
  min?: number | string;   // number for numeric fields, ISO string for date/datetime
  max?: number | string;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  message?: string;
}

export interface FormField {
  name: string;
  type: FieldType;
  label: string;
  required?: boolean;
  options?: string;          // comma-separated in the builder (select | radio | multiselect)
  placeholder?: string;
  fields?: FormField[];      // group | repeater (recursive)
  validation?: FieldValidation;
  _keyDirty?: boolean;       // transient UI flag — stripped on submit
}

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',        label: 'Text' },
  { value: 'textarea',    label: 'Textarea' },
  { value: 'number',      label: 'Number' },
  { value: 'email',       label: 'Email' },
  { value: 'url',         label: 'URL' },
  { value: 'phone',       label: 'Phone' },
  { value: 'date',        label: 'Date' },
  { value: 'datetime',    label: 'Date & Time' },
  { value: 'boolean',     label: 'Boolean (yes/no)' },
  { value: 'select',      label: 'Select (dropdown)' },
  { value: 'radio',       label: 'Radio (single pick)' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'tags',        label: 'Tags (freeform)' },
  { value: 'group',       label: 'Group (object)' },
  { value: 'repeater',    label: 'Repeater (list)' },
];

/** Max nesting the builder offers — matches the backend FORM_MAX_DEPTH default. */
export const MAX_BUILDER_DEPTH = 3;

export const OPTION_TYPES: FieldType[] = ['select', 'radio', 'multiselect'];
export const NESTED_TYPES: FieldType[] = ['group', 'repeater'];

/** Types that support the declarative validation panel (and which rules apply). */
export function validationRulesFor(type: FieldType): Array<keyof FieldValidation> {
  switch (type) {
    case 'number':
      return ['min', 'max', 'integer', 'message'];
    case 'text':
    case 'textarea':
    case 'email':
    case 'url':
    case 'phone':
      return ['minLength', 'maxLength', 'pattern', 'message'];
    case 'date':
    case 'datetime':
      return ['min', 'max', 'message'];
    case 'multiselect':
    case 'tags':
    case 'repeater':
      return ['minItems', 'maxItems', 'message'];
    default:
      return []; // boolean, select, radio, group → no extra rules
  }
}

export const toFieldKey = (v: string) =>
  v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

export function blankField(): FormField {
  return { name: '', type: 'text', label: '', required: false };
}

/** Stored field (from API) → builder field: options array → string, recurse, set _keyDirty. */
export function hydrateField(f: any): FormField {
  return {
    name: f.name ?? '',
    type: f.type ?? 'text',
    label: f.label ?? '',
    required: !!f.required || !!f.validation?.required,
    options: Array.isArray(f.options) ? f.options.join(', ') : (f.options ?? ''),
    placeholder: f.placeholder,
    validation: f.validation,
    fields: Array.isArray(f.fields) ? f.fields.map(hydrateField) : undefined,
    _keyDirty: !!(f.name && String(f.name).trim()),
  };
}

/** Keep only rules that apply to the type and are actually set. Returns undefined if empty. */
function cleanValidation(v: FieldValidation | undefined, type: FieldType): FieldValidation | undefined {
  if (!v) return undefined;
  const allowed = validationRulesFor(type);
  const out: FieldValidation = {};
  for (const key of allowed) {
    const val = v[key];
    if (key === 'integer') {
      if (val === true) out.integer = true;
    } else if (typeof val === 'string') {
      if (val.trim() !== '') (out as any)[key] = val.trim();
    } else if (typeof val === 'number' && !Number.isNaN(val)) {
      (out as any)[key] = val;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A field is keepable if it has both a key and a label. */
export function isFieldValid(f: FormField): boolean {
  return !!f.name.trim() && !!f.label.trim();
}

/** Builder field → API shape: options string → array, strip transient flags, recurse. */
export function normalizeField(f: FormField): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: toFieldKey(f.name),
    type: f.type,
    label: f.label.trim(),
    required: !!f.required,
  };
  if (f.placeholder) out.placeholder = f.placeholder;

  if (OPTION_TYPES.includes(f.type) && f.options) {
    out.options = f.options.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (NESTED_TYPES.includes(f.type) && f.fields) {
    out.fields = f.fields.filter(isFieldValid).map(normalizeField);
  }
  const validation = cleanValidation(f.validation, f.type);
  if (validation) out.validation = validation;

  return out;
}
