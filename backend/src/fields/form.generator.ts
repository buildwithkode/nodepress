import { Injectable } from '@nestjs/common';
import {
  FieldDef,
  FieldType,
  ContentSchema,
  SimpleFieldDef,
  TextFieldDef,
  NumberFieldDef,
  BooleanFieldDef,
  SelectFieldDef,
  RepeaterFieldDef,
  FlexibleFieldDef,
} from './field.types';

// ─── Output shape ──────────────────────────────────────────────────────────────

export interface FormConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  choices?: string[];
  multiple?: boolean;
  defaultValue?: boolean;
  minItems?: number;
  maxItems?: number;
}

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  /**
   * Frontend component hint — maps 1-to-1 with a UI widget.
   * Extending: add the new type to WIDGET_MAP below.
   */
  widget: string;
  constraints: FormConstraints;
  // repeater
  subFields?: FormField[];
  // flexible
  layouts?: FormLayout[];
}

export interface FormLayout {
  name: string;
  label: string;
  fields: FormField[];
}

export interface FormStructure {
  contentType: string;
  fields: FormField[];
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class FormGenerator {
  /**
   * Widget map — the single place to register what UI component renders each type.
   * Adding a new field type: add one entry here.
   */
  private static readonly WIDGET_MAP: Record<FieldType, string> = {
    text:       'text-input',
    textarea:   'textarea',
    richtext:   'rich-text-editor',
    number:     'number-input',
    boolean:    'switch',
    select:     'select',
    image:      'image-url-input',
    repeater:   'repeater',
    flexible:   'flexible-content',
    relation:   'relation-picker',
  };

  // ─── Public entry point ──────────────────────────────────────────────────────

  generate(contentTypeName: string, schema: ContentSchema): FormStructure {
    return {
      contentType: contentTypeName,
      fields: schema.map((f) => this.buildField(f)),
    };
  }

  // ─── Field builders ──────────────────────────────────────────────────────────

  private buildField(field: FieldDef): FormField {
    const base: FormField = {
      name: field.name,
      label: this.toLabel(field.label, field.name),
      type: field.type,
      required: field.required ?? false,
      description: field.description,
      widget: FormGenerator.WIDGET_MAP[field.type],
      constraints: this.buildConstraints(field),
    };

    if (field.type === 'repeater') {
      base.subFields = (field as RepeaterFieldDef).options.subFields.map((sf) =>
        this.buildField(sf as FieldDef),
      );
    }

    if (field.type === 'flexible') {
      base.layouts = (field as FlexibleFieldDef).options.layouts.map((layout) => ({
        name: layout.name,
        label: this.toLabel(layout.label, layout.name),
        fields: layout.fields.map((f) => this.buildField(f as FieldDef)),
      }));
    }

    return base;
  }

  private buildConstraints(field: FieldDef): FormConstraints {
    const opts = (field as any).options;
    if (!opts) return {};

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'richtext': {
        const o = opts as TextFieldDef['options'];
        return {
          ...(o?.minLength !== undefined && { minLength: o.minLength }),
          ...(o?.maxLength !== undefined && { maxLength: o.maxLength }),
          ...(o?.pattern   !== undefined && { pattern:   o.pattern }),
        };
      }
      case 'number': {
        const o = opts as NumberFieldDef['options'];
        return {
          ...(o?.min     !== undefined && { min:     o.min }),
          ...(o?.max     !== undefined && { max:     o.max }),
          ...(o?.integer !== undefined && { integer: o.integer }),
        };
      }
      case 'boolean': {
        const o = opts as BooleanFieldDef['options'];
        return {
          ...(o?.defaultValue !== undefined && { defaultValue: o.defaultValue }),
        };
      }
      case 'select': {
        const o = opts as SelectFieldDef['options'];
        return {
          choices:  o.choices,
          multiple: o.multiple ?? false,
        };
      }
      case 'repeater': {
        const o = opts as RepeaterFieldDef['options'];
        return {
          ...(o.minItems !== undefined && { minItems: o.minItems }),
          ...(o.maxItems !== undefined && { maxItems: o.maxItems }),
        };
      }
      case 'flexible': {
        const o = opts as FlexibleFieldDef['options'];
        return {
          ...(o.minItems !== undefined && { minItems: o.minItems }),
          ...(o.maxItems !== undefined && { maxItems: o.maxItems }),
        };
      }
      default:
        return {};
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** "my_field_name" → "My Field Name" */
  private toLabel(label: string | undefined, name: string): string {
    if (label) return label;
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
