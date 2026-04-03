import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  FieldDef,
  SimpleFieldDef,
  TextFieldDef,
  NumberFieldDef,
  SelectFieldDef,
  RepeaterFieldDef,
  FlexibleFieldDef,
  ContentSchema,
} from './field.types';

/**
 * DataValidator — validates that entry data satisfies a content type schema.
 *
 * Design choices:
 *  - All errors are collected before throwing (full error list per request).
 *  - Extra keys in data beyond what the schema defines are silently ignored
 *    (allows schema evolution without breaking existing entries).
 *  - Coercion is NOT performed — values must already be the correct JS type.
 *  - Validation runs on create AND update. For partial updates (data is a
 *    subset of all fields) pass `partial: true` to skip required-field checks
 *    for absent keys.
 */
@Injectable()
export class DataValidator {

  // ─── Public entry point ────────────────────────────────────────────────────

  validate(
    data: Record<string, unknown>,
    schema: ContentSchema,
    options: { partial?: boolean } = {},
  ): void {
    const errors: string[] = [];
    this.validateFields(data, schema, '', errors, options.partial ?? false);

    if (errors.length) {
      throw new UnprocessableEntityException({ message: 'Data validation failed', errors });
    }
  }

  // ─── Top-level field loop ──────────────────────────────────────────────────

  private validateFields(
    data: Record<string, unknown>,
    schema: ContentSchema,
    pathPrefix: string,
    errors: string[],
    partial: boolean,
  ): void {
    for (const field of schema) {
      const path = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;
      const value = data[field.name];
      const absent = value === undefined || value === null || value === '';

      if (absent) {
        if (field.required && !partial) {
          errors.push(`${path}: required`);
        }
        continue; // nothing more to validate for absent values
      }

      switch (field.type) {
        case 'text':
        case 'textarea':
        case 'richtext':
          this.validateText(value, field as TextFieldDef, path, errors);
          break;
        case 'number':
          this.validateNumber(value, field as NumberFieldDef, path, errors);
          break;
        case 'boolean':
          this.validateBoolean(value, path, errors);
          break;
        case 'select':
          this.validateSelect(value, field as SelectFieldDef, path, errors);
          break;
        case 'image':
          this.validateImage(value, path, errors);
          break;
        case 'repeater':
          this.validateRepeater(value, field as RepeaterFieldDef, path, errors, partial);
          break;
        case 'flexible':
          this.validateFlexible(value, field as FlexibleFieldDef, path, errors, partial);
          break;
      }
    }
  }

  // ─── Simple type validators ────────────────────────────────────────────────

  private validateText(
    value: unknown,
    field: TextFieldDef,
    path: string,
    errors: string[],
  ): void {
    if (typeof value !== 'string') {
      errors.push(`${path}: must be a string`);
      return;
    }
    const opts = field.options;
    if (!opts) return;

    if (opts.minLength !== undefined && value.length < opts.minLength) {
      errors.push(`${path}: must be at least ${opts.minLength} characters`);
    }
    if (opts.maxLength !== undefined && value.length > opts.maxLength) {
      errors.push(`${path}: must be at most ${opts.maxLength} characters`);
    }
    if (opts.pattern) {
      try {
        if (!new RegExp(opts.pattern).test(value)) {
          errors.push(`${path}: does not match required pattern`);
        }
      } catch {
        // invalid pattern — already caught by schema validator, skip here
      }
    }
  }

  private validateNumber(
    value: unknown,
    field: NumberFieldDef,
    path: string,
    errors: string[],
  ): void {
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(`${path}: must be a finite number`);
      return;
    }
    const opts = field.options;
    if (!opts) return;

    if (opts.integer && !Number.isInteger(value)) {
      errors.push(`${path}: must be an integer`);
    }
    if (opts.min !== undefined && value < opts.min) {
      errors.push(`${path}: must be ≥ ${opts.min}`);
    }
    if (opts.max !== undefined && value > opts.max) {
      errors.push(`${path}: must be ≤ ${opts.max}`);
    }
  }

  private validateBoolean(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== 'boolean') {
      errors.push(`${path}: must be a boolean`);
    }
  }

  private validateSelect(
    value: unknown,
    field: SelectFieldDef,
    path: string,
    errors: string[],
  ): void {
    const { choices, multiple } = field.options;

    if (multiple) {
      if (!Array.isArray(value)) {
        errors.push(`${path}: must be an array (multiple select)`);
        return;
      }
      (value as unknown[]).forEach((v, i) => {
        if (typeof v !== 'string') {
          errors.push(`${path}[${i}]: must be a string`);
        } else if (!choices.includes(v)) {
          errors.push(`${path}[${i}]: "${v}" is not a valid choice (${choices.join(', ')})`);
        }
      });
    } else {
      if (typeof value !== 'string') {
        errors.push(`${path}: must be a string`);
        return;
      }
      if (!choices.includes(value)) {
        errors.push(`${path}: "${value}" is not a valid choice (${choices.join(', ')})`);
      }
    }
  }

  private validateImage(value: unknown, path: string, errors: string[]): void {
    // Legacy: plain URL string
    if (typeof value === 'string') {
      if (!value) errors.push(`${path}: must be a non-empty URL`);
      return;
    }
    // Current: { url, alt? } object
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const img = value as Record<string, unknown>;
      if (typeof img.url !== 'string' || !img.url) {
        errors.push(`${path}.url: must be a non-empty string`);
      }
      if (img.alt !== undefined && typeof img.alt !== 'string') {
        errors.push(`${path}.alt: must be a string`);
      }
      return;
    }
    errors.push(`${path}: must be a URL string or { url, alt } object`);
  }

  // ─── Complex type validators ───────────────────────────────────────────────

  private validateRepeater(
    value: unknown,
    field: RepeaterFieldDef,
    path: string,
    errors: string[],
    partial: boolean,
  ): void {
    if (!Array.isArray(value)) {
      errors.push(`${path}: must be an array`);
      return;
    }

    const { subFields, minItems, maxItems } = field.options;

    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path}: must have at least ${minItems} item(s)`);
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(`${path}: must have at most ${maxItems} item(s)`);
    }

    value.forEach((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`${path}[${i}]: must be an object`);
        return;
      }
      this.validateFields(
        item as Record<string, unknown>,
        subFields as FieldDef[],
        `${path}[${i}]`,
        errors,
        partial,
      );
    });
  }

  private validateFlexible(
    value: unknown,
    field: FlexibleFieldDef,
    path: string,
    errors: string[],
    partial: boolean,
  ): void {
    if (!Array.isArray(value)) {
      errors.push(`${path}: must be an array`);
      return;
    }

    const { layouts, minItems, maxItems } = field.options;
    const layoutMap = new Map(layouts.map((l) => [l.name, l]));

    if (minItems !== undefined && value.length < minItems) {
      errors.push(`${path}: must have at least ${minItems} block(s)`);
    }
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(`${path}: must have at most ${maxItems} block(s)`);
    }

    value.forEach((item, i) => {
      const blockPath = `${path}[${i}]`;

      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`${blockPath}: must be an object`);
        return;
      }

      const block = item as Record<string, unknown>;
      const layoutName = block['_layout'];

      if (typeof layoutName !== 'string' || !layoutName) {
        errors.push(`${blockPath}._layout: required — must be one of: ${layouts.map((l) => l.name).join(', ')}`);
        return;
      }

      const layout = layoutMap.get(layoutName);
      if (!layout) {
        errors.push(
          `${blockPath}._layout: "${layoutName}" is not a defined layout (${layouts.map((l) => l.name).join(', ')})`,
        );
        return;
      }

      this.validateFields(
        block,
        layout.fields as FieldDef[],
        blockPath,
        errors,
        partial,
      );
    });
  }
}
