import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { FormField, FieldValidation } from './types/form-field.types';

// ---------------------------------------------------------------------------
// Headless form submission validator.
//
// Walks the form's field schema recursively, coercing each value to its real
// type (arrays stay arrays, objects stay objects) and applying the optional
// declarative validation rules. Errors are collected with dot/[i] paths and
// thrown together as a single 400. Public-endpoint guardrails (depth, array
// size, field count, payload size) are enforced before/within the walk.
//
// See specs/forms-rich-nested-validation.md.
// ---------------------------------------------------------------------------

export interface FormLimits {
  maxDepth: number;
  maxArrayItems: number;
  maxFields: number;
  maxPayloadBytes: number;
}

export interface ValidationError {
  path: string;
  rule: string;
  message: string;
}

interface Counter {
  fields: number;
  aborted: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PHONE_RE = /^[+]?[\d\s().-]{6,20}$/;

const ARRAY_TYPES = new Set(['multiselect', 'tags', 'repeater']);

/** Field label for error messages. */
function label(field: FormField): string {
  return field.label ?? field.name;
}

/** Fold the legacy top-level `required` into validation.required (non-mutating). */
function rules(field: FormField): FieldValidation {
  const v = field.validation ?? {};
  if (field.required && v.required === undefined) return { ...v, required: true };
  return v;
}

/** Entry point. Returns the clean, typed submission object or throws. */
export function validateSubmission(
  fields: FormField[],
  raw: Record<string, unknown>,
  limits: FormLimits,
): Record<string, unknown> {
  const data = raw ?? {};

  // Guardrail: total payload size
  const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (bytes > limits.maxPayloadBytes) {
    throw new PayloadTooLargeException(
      `Submission payload too large: ${bytes} bytes (limit ${limits.maxPayloadBytes})`,
    );
  }

  const errors: ValidationError[] = [];
  const counter: Counter = { fields: 0, aborted: false };

  const clean = walkGroup(fields, data, '', 1, limits, errors, counter);

  if (errors.length > 0) {
    throw new BadRequestException({ message: 'Validation failed', errors });
  }
  return clean;
}

/** Validate an object's worth of fields, returning the cleaned object. */
function walkGroup(
  fields: FormField[],
  raw: Record<string, unknown>,
  basePath: string,
  depth: number,
  limits: FormLimits,
  errors: ValidationError[],
  counter: Counter,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  if (depth > limits.maxDepth) {
    errors.push({
      path: basePath || '(root)',
      rule: 'maxDepth',
      message: `Nesting exceeds the maximum depth of ${limits.maxDepth}`,
    });
    return clean;
  }

  for (const field of fields) {
    counter.fields += 1;
    if (counter.fields > limits.maxFields) {
      if (!counter.aborted) {
        counter.aborted = true;
        errors.push({
          path: '(root)',
          rule: 'maxFields',
          message: `Submission has too many fields (limit ${limits.maxFields})`,
        });
      }
      return clean;
    }

    const path = basePath ? `${basePath}.${field.name}` : field.name;
    clean[field.name] = validateField(field, raw?.[field.name], path, depth, limits, errors, counter);
  }

  return clean;
}

/** Validate + coerce a single field value. Returns the cleaned value (or null). */
function validateField(
  field: FormField,
  value: unknown,
  path: string,
  depth: number,
  limits: FormLimits,
  errors: ValidationError[],
  counter: Counter,
): unknown {
  const v = rules(field);
  const err = (rule: string, message: string) =>
    errors.push({ path, rule, message: v.message ?? message });

  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    if (v.required) err('required', `"${label(field)}" is required`);
    return null;
  }

  switch (field.type) {
    case 'group': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        err('type', `"${label(field)}" must be an object`);
        return null;
      }
      return walkGroup(field.fields ?? [], value as Record<string, unknown>, path, depth + 1, limits, errors, counter);
    }

    case 'repeater': {
      if (!Array.isArray(value)) {
        err('type', `"${label(field)}" must be an array`);
        return null;
      }
      checkItems(field, value, path, v, limits, errors);
      const out: unknown[] = [];
      const n = Math.min(value.length, limits.maxArrayItems);
      for (let i = 0; i < n; i++) {
        const item = value[i];
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          errors.push({ path: `${path}[${i}]`, rule: 'type', message: `"${label(field)}" items must be objects` });
          out.push(null);
          continue;
        }
        out.push(walkGroup(field.fields ?? [], item as Record<string, unknown>, `${path}[${i}]`, depth + 1, limits, errors, counter));
      }
      return out;
    }

    case 'multiselect': {
      if (!Array.isArray(value)) {
        err('type', `"${label(field)}" must be an array`);
        return null;
      }
      checkItems(field, value, path, v, limits, errors);
      const opts = field.options ?? [];
      const out: string[] = [];
      value.slice(0, limits.maxArrayItems).forEach((raw, i) => {
        const s = String(raw).trim();
        if (opts.length && !opts.includes(s)) {
          errors.push({ path: `${path}[${i}]`, rule: 'options', message: v.message ?? `"${label(field)}" must be one of: ${opts.join(', ')}` });
        } else {
          out.push(s);
        }
      });
      return out;
    }

    case 'tags': {
      if (!Array.isArray(value)) {
        err('type', `"${label(field)}" must be an array`);
        return null;
      }
      checkItems(field, value, path, v, limits, errors);
      return value.slice(0, limits.maxArrayItems).map((s) => String(s).trim()).filter(Boolean);
    }

    default:
      return coerceScalar(field, value, v, err, path, errors);
  }
}

/** Coerce + validate a scalar (non-nested, non-array) field. */
function coerceScalar(
  field: FormField,
  value: unknown,
  v: FieldValidation,
  err: (rule: string, message: string) => void,
  path: string,
  errors: ValidationError[],
): unknown {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const s = String(value).trim();
      checkString(s, field, v, err);
      return s;
    }

    case 'email': {
      const s = String(value).trim().toLowerCase();
      if (!EMAIL_RE.test(s)) err('email', `"${label(field)}" must be a valid email address`);
      checkString(s, field, v, err);
      return s;
    }

    case 'url': {
      const s = String(value).trim();
      try {
        new URL(s);
      } catch {
        err('url', `"${label(field)}" must be a valid URL`);
      }
      checkString(s, field, v, err);
      return s;
    }

    case 'phone': {
      const s = String(value).trim();
      const re = v.pattern ? new RegExp(v.pattern) : DEFAULT_PHONE_RE;
      if (!re.test(s)) err('pattern', `"${label(field)}" must be a valid phone number`);
      return s;
    }

    case 'number': {
      const n = Number(value);
      if (typeof value === 'boolean' || Number.isNaN(n)) {
        err('number', `"${label(field)}" must be a number`);
        return null;
      }
      if (v.integer && !Number.isInteger(n)) err('integer', `"${label(field)}" must be a whole number`);
      if (v.min !== undefined && n < Number(v.min)) err('min', `"${label(field)}" must be at least ${v.min}`);
      if (v.max !== undefined && n > Number(v.max)) err('max', `"${label(field)}" must be at most ${v.max}`);
      return n;
    }

    case 'boolean':
    case 'checkbox': // legacy alias
      return value === true || value === 'true' || value === 1 || value === '1';

    case 'date': {
      const iso = toIsoDate(value);
      if (!iso) {
        err('date', `"${label(field)}" must be a valid date (YYYY-MM-DD)`);
        return null;
      }
      checkDateRange(iso, field, v, err);
      return iso;
    }

    case 'datetime': {
      const iso = toIsoDateTime(value);
      if (!iso) {
        err('datetime', `"${label(field)}" must be a valid date-time`);
        return null;
      }
      checkDateRange(iso, field, v, err);
      return iso;
    }

    case 'select':
    case 'radio': {
      const s = String(value).trim();
      const opts = field.options ?? [];
      if (opts.length && !opts.includes(s)) {
        err('options', `"${label(field)}" must be one of: ${opts.join(', ')}`);
      }
      return s;
    }

    default:
      return String(value).trim();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function checkString(
  s: string,
  field: FormField,
  v: FieldValidation,
  err: (rule: string, message: string) => void,
): void {
  if (v.minLength !== undefined && s.length < v.minLength) err('minLength', `"${label(field)}" must be at least ${v.minLength} characters`);
  if (v.maxLength !== undefined && s.length > v.maxLength) err('maxLength', `"${label(field)}" must be at most ${v.maxLength} characters`);
  if (v.pattern && !new RegExp(v.pattern).test(s)) err('pattern', `"${label(field)}" has an invalid format`);
}

function checkItems(
  field: FormField,
  arr: unknown[],
  path: string,
  v: FieldValidation,
  limits: FormLimits,
  errors: ValidationError[],
): void {
  if (arr.length > limits.maxArrayItems) {
    errors.push({ path, rule: 'maxArrayItems', message: `"${label(field)}" exceeds the maximum of ${limits.maxArrayItems} items` });
  }
  if (v.minItems !== undefined && arr.length < v.minItems) {
    errors.push({ path, rule: 'minItems', message: v.message ?? `"${label(field)}" needs at least ${v.minItems} item(s)` });
  }
  if (v.maxItems !== undefined && arr.length > v.maxItems) {
    errors.push({ path, rule: 'maxItems', message: v.message ?? `"${label(field)}" allows at most ${v.maxItems} item(s)` });
  }
}

function checkDateRange(
  iso: string,
  field: FormField,
  v: FieldValidation,
  err: (rule: string, message: string) => void,
): void {
  const t = new Date(iso).getTime();
  if (v.min !== undefined && t < new Date(String(v.min)).getTime()) err('min', `"${label(field)}" must be on or after ${v.min}`);
  if (v.max !== undefined && t > new Date(String(v.max)).getTime()) err('max', `"${label(field)}" must be on or before ${v.max}`);
}

/** Parse to a canonical YYYY-MM-DD, or null if not a real date. */
function toIsoDate(value: unknown): string | null {
  const s = String(value).trim();
  // Require a date-like shape so loose strings/numbers don't parse by accident.
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Parse to a canonical ISO 8601 datetime, or null if not a real date-time. */
function toIsoDateTime(value: unknown): string | null {
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
