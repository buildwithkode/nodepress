import { randomBytes } from 'crypto';

/** 8-char random hex — unique, not sequential */
const randomId = () => randomBytes(4).toString('hex');

/**
 * Returns true if any array-of-objects item in the data is missing a `_id`.
 * Used to decide whether a lazy write-back is needed on read.
 */
export function needsRepeaterIds(data: Record<string, any>): boolean {
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if (!item._id) return true;
          if (needsRepeaterIds(item)) return true;
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (needsRepeaterIds(value)) return true;
    }
  }
  return false;
}

/**
 * Inject a unique random `_id` into every array-of-objects item.
 * - Used on WRITE (create/update) to store IDs permanently.
 * - Also used on READ for lazy migration of existing data (write-back).
 * - Existing `_id` values are always preserved.
 * - Primitive arrays (string[], number[]) are left untouched.
 */
export function injectRepeaterIds(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return { _id: item._id ?? randomId(), ...injectRepeaterIds(item) };
        }
        return item;
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = injectRepeaterIds(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Convert a single key to snake_case */
export const normalizeKey = (key: string): string =>
  key.trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Recursively normalize all keys in a data object to snake_case.
 * Handles nested objects (flexible/repeater) and arrays.
 */
export function normalizeDataKeys(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const k = normalizeKey(key);
    if (Array.isArray(value)) {
      result[k] = value.map((item) =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? normalizeDataKeys(item)
          : item,
      );
    } else if (typeof value === 'object' && value !== null) {
      result[k] = normalizeDataKeys(value);
    } else {
      result[k] = value;
    }
  }
  return result;
}
