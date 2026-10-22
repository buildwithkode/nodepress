/**
 * NodePress ACF-like field type system.
 *
 * Each field stored in a ContentType's schema JSONB column is a FieldDef.
 * Entry data is a Record<string, FieldValue> keyed by field.name.
 *
 * Extending: add a new entry to SIMPLE_FIELD_TYPES (or create a new branch
 * like RepeaterFieldDef), wire it in SchemaValidator and DataValidator, then
 * add its widget name to FormGenerator.WIDGET_MAP.
 */

import type { FieldCondition } from './field-condition';

// ─── Field type literals ──────────────────────────────────────────────────────

export const SIMPLE_FIELD_TYPES = [
  'text',
  'textarea',
  'richtext',
  'number',
  'boolean',
  'select',
  'image',
  'relation',
  'color',
  'date',
  'datetime',
  'json',
] as const;

export const COMPLEX_FIELD_TYPES = ['repeater', 'flexible', 'group'] as const;

/** Field types with scalar values that can carry `indexed: true` (B-tree comparable). */
export const INDEXABLE_FIELD_TYPES: ReadonlySet<string> = new Set([
  'text', 'textarea', 'number', 'boolean', 'select', 'date', 'datetime', 'color', 'relation',
]);

export const ALL_FIELD_TYPES = [...SIMPLE_FIELD_TYPES, ...COMPLEX_FIELD_TYPES] as const;

export type SimpleFieldType = (typeof SIMPLE_FIELD_TYPES)[number];
export type ComplexFieldType = (typeof COMPLEX_FIELD_TYPES)[number];
export type FieldType = (typeof ALL_FIELD_TYPES)[number];

// ─── Base ─────────────────────────────────────────────────────────────────────

interface BaseField {
  /** snake_case identifier, unique within a schema */
  name: string;
  /** Human-readable label; derived from name if absent */
  label?: string;
  type: FieldType;
  required?: boolean;
  /** Helper text shown below the input */
  description?: string;
  /**
   * Build a database index for filtering on this field (`?where[field][eq]=…`).
   * Top-level scalar fields only — see INDEXABLE_FIELD_TYPES.
   */
  indexed?: boolean;
  /** Show the field only when a sibling field matches — see field-condition.ts. */
  condition?: FieldCondition;
  /** Top-level field inserted inline from this reusable component (server-managed copy — see ComponentsService). */
  component?: string;
}

// ─── Simple field defs ────────────────────────────────────────────────────────

export interface TextFieldDef extends BaseField {
  type: 'text' | 'textarea' | 'richtext';
  options?: {
    minLength?: number;
    maxLength?: number;
    /** JS regex string (no delimiters) — validated server-side too */
    pattern?: string;
  };
}

export interface NumberFieldDef extends BaseField {
  type: 'number';
  options?: {
    min?: number;
    max?: number;
    /** Reject float values when true */
    integer?: boolean;
  };
}

export interface BooleanFieldDef extends BaseField {
  type: 'boolean';
  options?: {
    defaultValue?: boolean;
  };
}

export interface SelectFieldDef extends BaseField {
  type: 'select';
  options: {
    /** Plain string values (what entries store) */
    choices: string[];
    multiple?: boolean;
    /**
     * Name of a shared choice list. On every save the server copies the list's
     * values into `choices` and its labels into `choiceLabels` (see
     * choice-lists/choice-list.util.ts) — readers only ever need `choices`.
     */
    choiceList?: string;
    /** Display label per value, only where it differs from the value. */
    choiceLabels?: Record<string, string>;
  };
}

export interface ImageFieldDef extends BaseField {
  type: 'image';
  options?: Record<string, never>;
}

/** Runtime value for an image field */
export interface ImageValue {
  url: string;
  alt?: string;
}

export interface RelationFieldDef extends BaseField {
  type: 'relation';
  options: {
    /** The content type name this field links to (e.g. 'author') */
    relatedContentType: string;
    /** 'one' → single UUID; 'many' → array of UUIDs */
    cardinality: 'one' | 'many';
    /**
     * Makes this a reverse field: it lists the `relatedContentType` entries whose
     * relation field `mappedBy` points at this entry. Read-only and not stored —
     * resolved with ?populate= like a normal relation.
     */
    mappedBy?: string;
  };
}

/** A read-only reverse relation (`options.mappedBy`) — never stored in entry data. */
export function isReverseRelation(field: { type?: string; options?: any }): boolean {
  return field?.type === 'relation' && typeof field.options?.mappedBy === 'string' && field.options.mappedBy !== '';
}

export interface ColorFieldDef extends BaseField {
  type: 'color';
  options?: Record<string, never>;
}

export interface DateFieldDef extends BaseField {
  type: 'date' | 'datetime';
  options?: {
    min?: string;
    max?: string;
  };
}

export interface JsonFieldDef extends BaseField {
  type: 'json';
  options?: Record<string, never>;
}

/**
 * Runtime value for a relation field.
 * Stored as a publicId UUID string (cardinality=one) or UUID string[] (cardinality=many).
 * When ?populate=fieldName is requested, replaced inline with the full entry object.
 */
export type RelationValue = string | string[] | null;

/** Union of all non-nestable field definitions */
export type SimpleFieldDef =
  | TextFieldDef
  | NumberFieldDef
  | BooleanFieldDef
  | SelectFieldDef
  | ImageFieldDef
  | RelationFieldDef
  | ColorFieldDef
  | DateFieldDef
  | JsonFieldDef;

// ─── Complex field defs ───────────────────────────────────────────────────────

export interface RepeaterFieldDef extends BaseField {
  type: 'repeater';
  options: {
    /** The fields inside each repeater item — simple types only (no nested complex) */
    subFields: SimpleFieldDef[];
    minItems?: number;
    maxItems?: number;
  };
}

export interface FlexibleLayout {
  /** snake_case layout identifier */
  name: string;
  label?: string;
  /** The layout's fields come from this reusable component (server-managed copy). */
  component?: string;
  fields: SimpleFieldDef[];
}

export interface FlexibleFieldDef extends BaseField {
  type: 'flexible';
  options: {
    layouts: FlexibleLayout[];
    minItems?: number;
    maxItems?: number;
  };
}

export interface GroupFieldDef extends BaseField {
  type: 'group';
  options: {
    /** The fields inside the group — simple types only (no nested complex) */
    subFields: SimpleFieldDef[];
  };
}

/** Union of all field definitions — what is stored in ContentType.schema */
export type FieldDef = SimpleFieldDef | RepeaterFieldDef | FlexibleFieldDef | GroupFieldDef;

/** A complete content type schema */
export type ContentSchema = FieldDef[];

// ─── Runtime value types ──────────────────────────────────────────────────────

/** Value for a group field — a single nested object */
export type GroupValue = Record<string, unknown>;

/** Value for a single repeater row */
export type RepeaterItem = Record<string, unknown>;

/** Value for a single flexible content block; _layout identifies the layout */
export interface FlexibleItem extends Record<string, unknown> {
  _layout: string;
}

/** Union of all possible field values stored in Entry.data */
export type FieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ImageValue
  | RelationValue
  | GroupValue
  | RepeaterItem[]
  | FlexibleItem[];
