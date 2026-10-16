/**
 * Field types that can carry `indexed: true` — mirrors INDEXABLE_FIELD_TYPES in
 * backend/src/fields/field.types.ts. An indexed field gets a database index so
 * `?where[field][…]=` filters stay fast on large content types.
 */
export const INDEXABLE_FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'boolean', 'select', 'date', 'datetime', 'color', 'relation',
]);

export const INDEXED_HINT =
  'Index this field so API filters on it (?where[field][eq]=…) stay fast with many entries. Adds a little write overhead.';
