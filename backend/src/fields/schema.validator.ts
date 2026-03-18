import { Injectable, BadRequestException } from '@nestjs/common';
import {
  ALL_FIELD_TYPES,
  SIMPLE_FIELD_TYPES,
  SimpleFieldType,
  FieldDef,
} from './field.types';

/**
 * SchemaValidator — validates that a content type schema (array of field defs)
 * is structurally correct before it is persisted.
 *
 * Call validate() and it throws BadRequestException with all problems collected.
 */
@Injectable()
export class SchemaValidator {
  /** Field name: must start with letter/underscore, contain only [a-z0-9_] */
  private static readonly NAME_RE = /^[a-z_][a-z0-9_]*$/;

  // ─── Public entry point ────────────────────────────────────────────────────

  validate(schema: unknown): FieldDef[] {
    const errors: string[] = [];

    if (!Array.isArray(schema)) {
      throw new BadRequestException('schema must be an array of field definitions');
    }

    const fields = schema as any[];
    const names = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      this.validateField(fields[i], `schema[${i}]`, names, errors, false);
    }

    if (errors.length) {
      throw new BadRequestException({ message: 'Invalid schema', errors });
    }

    return fields as FieldDef[];
  }

  // ─── Field-level validation ────────────────────────────────────────────────

  private validateField(
    field: any,
    path: string,
    names: Set<string>,
    errors: string[],
    isSubField: boolean,
  ): void {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      errors.push(`${path}: must be an object`);
      return;
    }

    // name
    if (typeof field.name !== 'string' || !field.name) {
      errors.push(`${path}.name: required string`);
    } else if (!SchemaValidator.NAME_RE.test(field.name)) {
      errors.push(
        `${path}.name "${field.name}": must be lowercase letters, digits, or underscores, starting with a letter or underscore`,
      );
    } else if (names.has(field.name)) {
      errors.push(`${path}.name "${field.name}": duplicate field name`);
    } else {
      names.add(field.name);
    }

    // type
    if (!ALL_FIELD_TYPES.includes(field.type)) {
      errors.push(
        `${path}.type "${field.type}": must be one of ${ALL_FIELD_TYPES.join(', ')}`,
      );
      return; // can't validate options without knowing the type
    }

    // Complex types are not allowed inside repeater/flexible sub-fields
    if (isSubField && (field.type === 'repeater' || field.type === 'flexible')) {
      errors.push(`${path}.type: nested repeater/flexible fields are not supported`);
      return;
    }

    // optional top-level flags
    if (field.required !== undefined && typeof field.required !== 'boolean') {
      errors.push(`${path}.required: must be boolean`);
    }
    if (field.label !== undefined && typeof field.label !== 'string') {
      errors.push(`${path}.label: must be string`);
    }
    if (field.description !== undefined && typeof field.description !== 'string') {
      errors.push(`${path}.description: must be string`);
    }

    // type-specific option validation
    switch (field.type as string) {
      case 'text':
      case 'textarea':
      case 'richtext':
        this.validateTextOptions(field.options, path, errors);
        break;
      case 'number':
        this.validateNumberOptions(field.options, path, errors);
        break;
      case 'boolean':
        this.validateBooleanOptions(field.options, path, errors);
        break;
      case 'select':
        this.validateSelectOptions(field.options, path, errors);
        break;
      case 'image':
        // no structured options
        break;
      case 'repeater':
        this.validateRepeaterOptions(field.options, path, errors);
        break;
      case 'flexible':
        this.validateFlexibleOptions(field.options, path, errors);
        break;
    }
  }

  // ─── Options validators ────────────────────────────────────────────────────

  private validateTextOptions(options: any, path: string, errors: string[]): void {
    if (options === undefined || options === null) return;
    if (typeof options !== 'object') {
      errors.push(`${path}.options: must be an object`);
      return;
    }
    if (options.minLength !== undefined && (!Number.isInteger(options.minLength) || options.minLength < 0)) {
      errors.push(`${path}.options.minLength: must be a non-negative integer`);
    }
    if (options.maxLength !== undefined && (!Number.isInteger(options.maxLength) || options.maxLength < 1)) {
      errors.push(`${path}.options.maxLength: must be a positive integer`);
    }
    if (
      options.minLength !== undefined &&
      options.maxLength !== undefined &&
      options.minLength > options.maxLength
    ) {
      errors.push(`${path}.options: minLength must not exceed maxLength`);
    }
    if (options.pattern !== undefined) {
      if (typeof options.pattern !== 'string') {
        errors.push(`${path}.options.pattern: must be a string`);
      } else {
        try { new RegExp(options.pattern); } catch {
          errors.push(`${path}.options.pattern: invalid regular expression`);
        }
      }
    }
  }

  private validateNumberOptions(options: any, path: string, errors: string[]): void {
    if (options === undefined || options === null) return;
    if (typeof options !== 'object') {
      errors.push(`${path}.options: must be an object`);
      return;
    }
    if (options.min !== undefined && typeof options.min !== 'number') {
      errors.push(`${path}.options.min: must be a number`);
    }
    if (options.max !== undefined && typeof options.max !== 'number') {
      errors.push(`${path}.options.max: must be a number`);
    }
    if (
      typeof options.min === 'number' &&
      typeof options.max === 'number' &&
      options.min > options.max
    ) {
      errors.push(`${path}.options: min must not exceed max`);
    }
    if (options.integer !== undefined && typeof options.integer !== 'boolean') {
      errors.push(`${path}.options.integer: must be boolean`);
    }
  }

  private validateBooleanOptions(options: any, path: string, errors: string[]): void {
    if (options === undefined || options === null) return;
    if (options.defaultValue !== undefined && typeof options.defaultValue !== 'boolean') {
      errors.push(`${path}.options.defaultValue: must be boolean`);
    }
  }

  private validateSelectOptions(options: any, path: string, errors: string[]): void {
    if (!options || typeof options !== 'object') {
      errors.push(`${path}.options: required for select fields`);
      return;
    }
    if (!Array.isArray(options.choices) || options.choices.length === 0) {
      errors.push(`${path}.options.choices: must be a non-empty array of strings`);
    } else {
      options.choices.forEach((c: any, i: number) => {
        if (typeof c !== 'string' || !c) {
          errors.push(`${path}.options.choices[${i}]: must be a non-empty string`);
        }
      });
      const unique = new Set(options.choices);
      if (unique.size !== options.choices.length) {
        errors.push(`${path}.options.choices: duplicate values are not allowed`);
      }
    }
    if (options.multiple !== undefined && typeof options.multiple !== 'boolean') {
      errors.push(`${path}.options.multiple: must be boolean`);
    }
  }

  private validateRepeaterOptions(options: any, path: string, errors: string[]): void {
    if (!options || typeof options !== 'object') {
      errors.push(`${path}.options: required for repeater fields`);
      return;
    }
    if (!Array.isArray(options.subFields) || options.subFields.length === 0) {
      errors.push(`${path}.options.subFields: must be a non-empty array`);
    } else {
      const subNames = new Set<string>();
      options.subFields.forEach((sf: any, i: number) => {
        this.validateField(sf, `${path}.options.subFields[${i}]`, subNames, errors, true);
      });
    }
    if (options.minItems !== undefined && (!Number.isInteger(options.minItems) || options.minItems < 0)) {
      errors.push(`${path}.options.minItems: must be a non-negative integer`);
    }
    if (options.maxItems !== undefined && (!Number.isInteger(options.maxItems) || options.maxItems < 1)) {
      errors.push(`${path}.options.maxItems: must be a positive integer`);
    }
    if (
      typeof options.minItems === 'number' &&
      typeof options.maxItems === 'number' &&
      options.minItems > options.maxItems
    ) {
      errors.push(`${path}.options: minItems must not exceed maxItems`);
    }
  }

  private validateFlexibleOptions(options: any, path: string, errors: string[]): void {
    if (!options || typeof options !== 'object') {
      errors.push(`${path}.options: required for flexible fields`);
      return;
    }
    if (!Array.isArray(options.layouts) || options.layouts.length === 0) {
      errors.push(`${path}.options.layouts: must be a non-empty array`);
    } else {
      const layoutNames = new Set<string>();
      options.layouts.forEach((layout: any, i: number) => {
        const lPath = `${path}.options.layouts[${i}]`;
        if (typeof layout.name !== 'string' || !layout.name) {
          errors.push(`${lPath}.name: required string`);
        } else if (!SchemaValidator.NAME_RE.test(layout.name)) {
          errors.push(`${lPath}.name "${layout.name}": must be lowercase letters, digits, or underscores`);
        } else if (layoutNames.has(layout.name)) {
          errors.push(`${lPath}.name "${layout.name}": duplicate layout name`);
        } else {
          layoutNames.add(layout.name);
        }
        if (layout.label !== undefined && typeof layout.label !== 'string') {
          errors.push(`${lPath}.label: must be string`);
        }
        if (!Array.isArray(layout.fields) || layout.fields.length === 0) {
          errors.push(`${lPath}.fields: must be a non-empty array`);
        } else {
          const fieldNames = new Set<string>();
          layout.fields.forEach((f: any, fi: number) => {
            this.validateField(f, `${lPath}.fields[${fi}]`, fieldNames, errors, true);
          });
        }
      });
    }
    if (options.minItems !== undefined && (!Number.isInteger(options.minItems) || options.minItems < 0)) {
      errors.push(`${path}.options.minItems: must be a non-negative integer`);
    }
    if (options.maxItems !== undefined && (!Number.isInteger(options.maxItems) || options.maxItems < 1)) {
      errors.push(`${path}.options.maxItems: must be a positive integer`);
    }
  }
}
