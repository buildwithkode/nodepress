'use client';

import { useState } from 'react';
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  FormField, FieldType, FieldValidation,
  FIELD_TYPES, NESTED_TYPES, OPTION_TYPES, MAX_BUILDER_DEPTH,
  toFieldKey, blankField, validationRulesFor,
} from './field-types';

interface FieldEditorProps {
  field: FormField;
  depth: number;          // 1 = top level
  canRemove: boolean;
  onChange: (next: FormField) => void;
  onRemove: () => void;
  innerRef?: React.Ref<HTMLDivElement>;
}

const RULE_LABELS: Record<keyof FieldValidation, string> = {
  min: 'Min', max: 'Max', integer: 'Whole number only',
  minLength: 'Min length', maxLength: 'Max length', pattern: 'Pattern (regex)',
  minItems: 'Min items', maxItems: 'Max items', message: 'Custom error message',
};

export default function FieldEditor({ field, depth, canRemove, onChange, onRemove, innerRef }: FieldEditorProps) {
  const rules = validationRulesFor(field.type);
  const activeRuleCount = rules.filter((r) => {
    const v = field.validation?.[r];
    return r === 'integer' ? v === true : v !== undefined && v !== '';
  }).length;
  const [showRules, setShowRules] = useState(activeRuleCount > 0);

  const set = (patch: Partial<FormField>) => onChange({ ...field, ...patch });

  const onLabel = (label: string) => {
    const patch: Partial<FormField> = { label };
    if (!field._keyDirty) patch.name = toFieldKey(label);
    set(patch);
  };

  const onKey = (name: string) => set({ name: toFieldKey(name), _keyDirty: true });

  const onType = (type: FieldType) => {
    const patch: Partial<FormField> = { type };
    if (!OPTION_TYPES.includes(type)) patch.options = undefined;
    if (!NESTED_TYPES.includes(type)) patch.fields = undefined;
    if (NESTED_TYPES.includes(type) && !field.fields) patch.fields = [blankField()];
    set(patch);
  };

  const setRule = (key: keyof FieldValidation, value: unknown) =>
    set({ validation: { ...field.validation, [key]: value } as FieldValidation });

  // ── sub-field helpers (group / repeater) ──────────────────────────────────
  const subFields = field.fields ?? [];
  const setSub = (i: number, next: FormField) =>
    set({ fields: subFields.map((f, idx) => (idx === i ? next : f)) });
  const addSub = () => set({ fields: [...subFields, blankField()] });
  const removeSub = (i: number) => set({ fields: subFields.filter((_, idx) => idx !== i) });

  const canNest = depth < MAX_BUILDER_DEPTH;
  const typeOptions = canNest ? FIELD_TYPES : FIELD_TYPES.filter((t) => !NESTED_TYPES.includes(t.value));

  return (
    <div ref={innerRef} className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2">
        {/* Label + Field Key */}
        <div className="flex-1 space-y-2">
          <Input
            placeholder="Label shown to user"
            value={field.label}
            onChange={(e) => onLabel(e.target.value)}
          />
          <div className="relative">
            <Input
              placeholder="field_key"
              value={field.name}
              onChange={(e) => onKey(e.target.value)}
              className="font-mono text-xs pr-14"
            />
            {field.name && (
              <span className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium border rounded px-1.5 py-0.5 pointer-events-none',
                field._keyDirty
                  ? 'bg-muted text-muted-foreground border-border'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
              )}>
                {field._keyDirty ? 'custom' : 'auto'}
              </span>
            )}
          </div>
        </div>

        {/* Type */}
        <Select value={field.type} onValueChange={(v) => onType(v as FieldType)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {typeOptions.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Required */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer mt-2.5">
          <Checkbox checked={!!field.required} onCheckedChange={(c) => set({ required: c === true })} />
          Required
        </label>

        {/* Validation toggle */}
        {rules.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Validation rules"
            className={cn('shrink-0 mt-1', (showRules || activeRuleCount > 0) && 'text-primary')}
            onClick={() => setShowRules((s) => !s)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeRuleCount > 0 && (
              <span className="ml-0.5 text-[10px] font-semibold">{activeRuleCount}</span>
            )}
          </Button>
        )}

        {/* Remove */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 mt-1"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Options (select / radio / multiselect) */}
      {OPTION_TYPES.includes(field.type) && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Options (comma-separated)
            <span className="ml-1 text-muted-foreground/50">
              — {field.type === 'multiselect' ? 'pick many' : field.type === 'radio' ? 'radio buttons' : 'dropdown'}
            </span>
          </Label>
          <Input
            placeholder="Option A, Option B, Option C"
            value={field.options ?? ''}
            onChange={(e) => set({ options: e.target.value })}
          />
        </div>
      )}

      {/* Validation rules panel */}
      {rules.length > 0 && showRules && (
        <div className="rounded-md border border-dashed bg-background/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Validation</p>
          <div className="grid grid-cols-2 gap-2">
            {rules.map((rule) => {
              if (rule === 'integer') {
                return (
                  <label key={rule} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer col-span-2">
                    <Checkbox
                      checked={field.validation?.integer === true}
                      onCheckedChange={(c) => setRule('integer', c === true)}
                    />
                    {RULE_LABELS.integer}
                  </label>
                );
              }
              const isDate = (rule === 'min' || rule === 'max') && (field.type === 'date' || field.type === 'datetime');
              const isNumeric = !isDate && (rule === 'min' || rule === 'max' || rule === 'minLength' || rule === 'maxLength' || rule === 'minItems' || rule === 'maxItems');
              const wide = rule === 'pattern' || rule === 'message';
              const raw = field.validation?.[rule];
              return (
                <div key={rule} className={cn('space-y-1', wide && 'col-span-2')}>
                  <Label className="text-[11px] text-muted-foreground">{RULE_LABELS[rule]}</Label>
                  <Input
                    className="h-8 text-xs"
                    type={isDate ? (field.type === 'datetime' ? 'datetime-local' : 'date') : isNumeric ? 'number' : 'text'}
                    placeholder={rule === 'pattern' ? '^[0-9]{6}$' : rule === 'message' ? 'Shown when this field fails' : ''}
                    value={raw === undefined ? '' : String(raw)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') return setRule(rule, undefined);
                      setRule(rule, isNumeric ? Number(val) : val);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nested sub-fields (group / repeater) */}
      {NESTED_TYPES.includes(field.type) && (
        <div className="space-y-2 border-l-2 border-orange-400 pl-3 ml-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {field.type === 'repeater' ? 'Item fields (repeats)' : 'Sub-fields'}
          </p>
          {subFields.map((sub, si) => (
            <FieldEditor
              key={si}
              field={sub}
              depth={depth + 1}
              canRemove={subFields.length > 1}
              onChange={(next) => setSub(si, next)}
              onRemove={() => removeSub(si)}
            />
          ))}
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={addSub}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add sub-field
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
