/**
 * Conditional fields: `condition: { field, op, value }` on a field shows it
 * only when a sibling field (same level: top-level fields, or the fields of the
 * same repeater row / group / flexible block) matches. A hidden field is never
 * required. A field whose condition field is hidden is hidden too.
 *
 * frontend/lib/field-condition.ts mirrors conditionMet/visibleFields — keep
 * them in step.
 */
export const CONDITION_OPERATORS = ['eq', 'ne', 'in', 'notIn', 'set', 'notSet'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface FieldCondition {
  field: string;
  op: ConditionOperator;
  /** eq/ne: a string, number or boolean; in/notIn: an array of them */
  value?: unknown;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const isScalar = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v);

/** Does `value` (the condition field's value) satisfy the condition? Multi-selects match on any choice. */
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

/** Names of the fields in one sibling list that are hidden for this data. */
export function hiddenFields(fields: { name: string; condition?: FieldCondition }[], data: Record<string, unknown>): Set<string> {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const memo = new Map<string, boolean>();
  const visible = (name: string, depth = 0): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    const cond = byName.get(name)?.condition;
    // depth guard: the schema validator rejects cycles, this is belt and braces
    const result = !cond || depth > fields.length || (visible(cond.field, depth + 1) && conditionMet(cond, data?.[cond.field]));
    memo.set(name, result);
    return result;
  };
  return new Set(fields.filter((f) => !visible(f.name)).map((f) => f.name));
}

/** Schema checks for the conditions in one sibling list. */
export function conditionErrors(fields: any[], path: (i: number) => string): string[] {
  const errors: string[] = [];
  const names = new Set(fields.map((f) => f?.name));
  fields.forEach((f, i) => {
    const c = f?.condition;
    if (c === undefined) return;
    const at = `${path(i)}.condition`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errors.push(`${at}: must be an object { field, op, value }`);
      return;
    }
    if (typeof c.field !== 'string' || !names.has(c.field)) {
      errors.push(`${at}.field: must name a field next to this one`);
    } else if (c.field === f.name) {
      errors.push(`${at}.field: a field can't depend on itself`);
    }
    if (!CONDITION_OPERATORS.includes(c.op)) {
      errors.push(`${at}.op: must be one of ${CONDITION_OPERATORS.join(', ')}`);
    } else if ((c.op === 'eq' || c.op === 'ne') && !isScalar(c.value)) {
      errors.push(`${at}.value: must be a string, number or boolean`);
    } else if ((c.op === 'in' || c.op === 'notIn') && (!Array.isArray(c.value) || !c.value.length || !c.value.every(isScalar))) {
      errors.push(`${at}.value: must be a non-empty list of strings, numbers or booleans`);
    }
  });

  // No cycles: following condition.field from any field must end.
  const deps = new Map(fields.filter((f) => f?.condition?.field).map((f) => [f.name, f.condition.field]));
  const inCycle = new Set<string>();
  for (const start of deps.keys()) {
    if (inCycle.has(start)) continue;
    const seen = [start];
    for (let at = deps.get(start); at !== undefined; at = deps.get(at)) {
      if (at === start) {
        seen.forEach((n) => inCycle.add(n));
        errors.push(`${path(fields.findIndex((f) => f?.name === start))}.condition: circular — ${[...seen, start].join(' → ')}`);
        break;
      }
      if (seen.includes(at)) break; // a cycle further on; reported from its own start
      seen.push(at);
    }
  }
  return errors;
}
