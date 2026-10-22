/**
 * Conditional fields — the admin's copy of backend/src/fields/field-condition.ts
 * (conditionMet / hiddenFields). Keep the two in step.
 */
export const CONDITION_OPERATORS = ['eq', 'ne', 'in', 'notIn', 'set', 'notSet'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface FieldCondition {
  field: string;
  op: ConditionOperator;
  value?: unknown;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function conditionMet(cond: FieldCondition, value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  switch (cond.op) {
    case 'set': return !isEmpty(value);
    case 'notSet': return isEmpty(value);
    case 'eq': return values.includes(cond.value);
    case 'ne': return !values.includes(cond.value);
    case 'in': return values.some((v) => (cond.value as unknown[]).includes(v));
    case 'notIn': return !values.some((v) => (cond.value as unknown[]).includes(v));
    default: return true;
  }
}

/** Names of the fields in one sibling list hidden for these values. */
export function hiddenFields(
  fields: { name: string; condition?: FieldCondition }[],
  data: Record<string, unknown> | undefined,
): Set<string> {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const memo = new Map<string, boolean>();
  const visible = (name: string, depth = 0): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    const cond = byName.get(name)?.condition;
    const result = !cond || depth > fields.length || (visible(cond.field, depth + 1) && conditionMet(cond, data?.[cond.field]));
    memo.set(name, result);
    return result;
  };
  return new Set(fields.filter((f) => !visible(f.name)).map((f) => f.name));
}

/**
 * Condition values are typed in the schema editor as text; store booleans and
 * numbers as such when the condition field is a switch or a number.
 */
export function coerceConditionValue(raw: string, fieldType?: string): string | number | boolean {
  if (fieldType === 'boolean') return raw === 'true';
  if (fieldType === 'number' && raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}
