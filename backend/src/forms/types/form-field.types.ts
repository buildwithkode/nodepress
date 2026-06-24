// ---------------------------------------------------------------------------
// Field definitions stored in Form.fields (JSON array)
// ---------------------------------------------------------------------------
export type FieldType =
  // scalars
  | 'text' | 'textarea' | 'number' | 'email' | 'url' | 'phone'
  | 'date' | 'datetime' | 'boolean'
  // choice
  | 'select' | 'radio' | 'multiselect' | 'tags'
  // nested
  | 'group'     // object — uses `fields`
  | 'repeater'  // array of objects — uses `fields`
  // legacy alias kept for back-compat (existing forms) — coerced like `boolean`
  | 'checkbox';

/**
 * Declarative, opt-in validation rules attached to a field.
 * All properties are optional; omitting `validation` means "type coercion only".
 */
export interface FieldValidation {
  required?: boolean;        // supersedes the legacy top-level `required`
  // numbers & dates (dates compared as ISO strings / timestamps)
  min?: number | string;
  max?: number | string;
  integer?: boolean;         // number must be a whole number
  // strings
  minLength?: number;
  maxLength?: number;
  pattern?: string;          // RegExp source, tested with `new RegExp(pattern)`
  // arrays (multiselect | tags | repeater)
  minItems?: number;
  maxItems?: number;
  // shared
  message?: string;          // custom error text override
}

export interface FormField {
  name: string;              // snake_case key used in submission data
  type: FieldType;
  label?: string;
  required?: boolean;        // legacy — normalized into validation.required
  options?: string[];        // for select | radio | multiselect
  placeholder?: string;
  fields?: FormField[];      // for group | repeater (recursive)
  validation?: FieldValidation;
}

// ---------------------------------------------------------------------------
// Action definitions stored in Form.actions (JSON array)
// ---------------------------------------------------------------------------
export type ActionType = 'email' | 'webhook';

export interface EmailAction {
  type: 'email';
  to: string;                // recipient address
  subject: string;           // supports {{field_name}} placeholders
  replyToField?: string;     // field name whose value becomes Reply-To header
}

export interface WebhookAction {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT';  // defaults to POST
  headers?: Record<string, string>;
}

export type ActionDef = EmailAction | WebhookAction;
