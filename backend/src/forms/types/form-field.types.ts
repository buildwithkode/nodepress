// ---------------------------------------------------------------------------
// Field definitions stored in Form.fields (JSON array)
// ---------------------------------------------------------------------------
export type FieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';

export interface FormField {
  name: string;       // snake_case key used in submission data
  type: FieldType;
  label: string;
  required?: boolean;
  options?: string[]; // for type === 'select' | 'radio'
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Action definitions stored in Form.actions (JSON array)
// ---------------------------------------------------------------------------
export type ActionType = 'email' | 'webhook' | 'email-reply';

export interface EmailAction {
  type: 'email';
  to: string;                // recipient address
  subject: string;           // supports {{field_name}} placeholders
  replyToField?: string;     // field name whose value becomes Reply-To header
}

export interface EmailReplyAction {
  type: 'email-reply';
  toField: string;           // form field name that holds the submitter's email address
  subject: string;           // supports {{field_name}} placeholders
  body?: string;             // optional custom message shown above the submission table
}

export interface WebhookAction {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT';  // defaults to POST
  headers?: Record<string, string>;
}

export type ActionDef = EmailAction | EmailReplyAction | WebhookAction;
