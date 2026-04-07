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
] as const;

export const COMPLEX_FIELD_TYPES = ['repeater', 'flexible'] as const;

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
    /** Plain string values; extend to { label, value } objects in a future iteration */
    choices: string[];
    multiple?: boolean;
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
  };
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
  | RelationFieldDef;

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

/** Union of all field definitions — what is stored in ContentType.schema */
export type FieldDef = SimpleFieldDef | RepeaterFieldDef | FlexibleFieldDef;

/** A complete content type schema */
export type ContentSchema = FieldDef[];

// ─── Runtime value types ──────────────────────────────────────────────────────

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
  | RepeaterItem[]
  | FlexibleItem[];
