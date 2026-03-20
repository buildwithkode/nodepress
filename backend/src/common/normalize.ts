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
