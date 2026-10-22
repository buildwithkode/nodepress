'use client';

import { useTranslations } from 'use-intl';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONDITION_OPERATORS, ConditionOperator, FieldCondition, coerceConditionValue } from '@/lib/field-condition';

export interface ConditionSibling {
  /** snake_case field key */
  key: string;
  label: string;
  type: string;
  /** select choices, when the sibling is a select */
  choices?: string[];
}

interface Props {
  condition?: FieldCondition;
  onChange: (condition: FieldCondition | undefined) => void;
  /** The other top-level fields this one can depend on */
  siblings: ConditionSibling[];
}

const NEEDS_VALUE = new Set<ConditionOperator>(['eq', 'ne', 'in', 'notIn']);
const LIST_VALUE = new Set<ConditionOperator>(['in', 'notIn']);

/** "Show only if <field> <operator> <value>" for one field in the content type editor. */
export function FieldConditionEditor({ condition, onChange, siblings }: Props) {
  const tct = useTranslations('contentTypes');

  if (!condition) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        disabled={siblings.length === 0}
        onClick={() => onChange({ field: siblings[0].key, op: 'set' })}
      >
        <Eye className="h-3.5 w-3.5 mr-1" />
        {tct('condition.add')}
      </Button>
    );
  }

  const target = siblings.find((s) => s.key === condition.field);
  const opItems = Object.fromEntries(CONDITION_OPERATORS.map((op) => [op, tct(`condition.ops.${op}`)]));
  const fieldItems = Object.fromEntries(siblings.map((s) => [s.key, s.label || s.key]));
  const valueText = Array.isArray(condition.value) ? condition.value.join(', ') : condition.value === undefined ? '' : String(condition.value);

  const setValue = (raw: string) => {
    const value = LIST_VALUE.has(condition.op)
      ? raw.split(',').map((v) => v.trim()).filter(Boolean).map((v) => coerceConditionValue(v, target?.type))
      : coerceConditionValue(raw, target?.type);
    onChange({ ...condition, value });
  };
  const setOp = (op: ConditionOperator) => {
    const { value, ...rest } = condition;
    if (!NEEDS_VALUE.has(op)) return onChange({ ...rest, op });
    // Keep the value, moving between one value and a list as needed.
    const list = Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value];
    onChange({ ...rest, op, value: LIST_VALUE.has(op) ? list : list[0] ?? (target?.type === 'boolean' ? true : '') });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{tct('condition.showIf')}</span>
      <Select value={condition.field} onValueChange={(v) => v && onChange({ ...condition, field: String(v) })} items={fieldItems}>
        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {siblings.map((s) => <SelectItem key={s.key} value={s.key}>{s.label || s.key}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={condition.op} onValueChange={(v) => v && setOp(v as ConditionOperator)} items={opItems}>
        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CONDITION_OPERATORS.map((op) => <SelectItem key={op} value={op}>{opItems[op]}</SelectItem>)}
        </SelectContent>
      </Select>
      {NEEDS_VALUE.has(condition.op) && (
        target?.type === 'boolean' && !LIST_VALUE.has(condition.op) ? (
          <Select
            value={String(condition.value === true)}
            onValueChange={(v) => setValue(String(v))}
            items={{ true: tct('condition.on'), false: tct('condition.off') }}
          >
            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{tct('condition.on')}</SelectItem>
              <SelectItem value="false">{tct('condition.off')}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="h-7 w-48 text-xs"
            value={valueText}
            placeholder={LIST_VALUE.has(condition.op) ? tct('condition.listPlaceholder') : (target?.choices?.[0] ?? tct('condition.valuePlaceholder'))}
            list={target?.choices?.length ? `cond-${condition.field}` : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
        )
      )}
      {target?.choices?.length ? (
        <datalist id={`cond-${condition.field}`}>
          {target.choices.map((c) => <option key={c} value={c} />)}
        </datalist>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7" title={tct('condition.remove')} onClick={() => onChange(undefined)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
