'use client';

import dynamic from 'next/dynamic';
import { Controller } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import RepeaterField from './RepeaterField';
import FlexibleField from './FlexibleField';
import GroupField from './GroupField';
import { MediaPickerModal } from '@/components/MediaPickerModal';
import { RelationPicker } from '@/components/RelationPicker';
import { ReverseRelationList } from '@/components/ReverseRelationList';
import { ChoiceSelect, type ChoiceOptions } from '@/components/ChoiceSelect';
import type { SubField } from './SubFields';

const RichTextEditor = dynamic(
  () => import('@/components/RichTextEditor'),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  },
);

function EditorLoading() {
  const t = useTranslations('entryEditor');
  return (
    <div className="h-44 w-full rounded-md border border-input bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
      {t('form.loadingEditor')}
    </div>
  );
}

interface Layout {
  name: string;
  label?: string;
  fields: SubField[];
}

interface Field {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  options?: any;
}

interface Props {
  field: Field;
  /** Form path of the value — the field name at top level, `blocks.0.buttons.1.label` deeper down. */
  name?: string;
  control: any;
  register: any;
  errors: any;
  watch?: any;
  /** The entry being edited — reverse relation fields list what links to it. */
  entryId?: number;
  /** Leave out a group's or repeater's label row — a component box shows its own title. */
  bare?: boolean;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** React Hook Form nests errors like values: `errors.blocks[0].buttons[1].label`. */
const errorAt = (errors: any, path: string) => path.split('.').reduce((e, k) => e?.[k], errors);

export default function DynamicFormField({
  field,
  name,
  control,
  register,
  errors,
  watch,
  entryId,
  bare,
}: Props) {
  const t = useTranslations('entryEditor');
  const tc = useTranslations('common');
  const path = name ?? field.name;
  const label = field.label?.trim() || toLabel(field.name);
  const error = errorAt(errors, path);

  // --- Repeater ---
  if (field.type === 'repeater') {
    const subFields =
      (field.options?.subFields as SubField[] | undefined)?.filter((f) => f.name) || [];
    return (
      <div className="mb-5">
        {!bare && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">
              repeater
            </span>
          </div>
        )}
        <RepeaterField
          fieldName={path}
          subFields={subFields}
          control={control}
          register={register}
          errors={errors}
          watch={watch}
        />
      </div>
    );
  }

  // --- Group ---
  if (field.type === 'group') {
    const subFields =
      (field.options?.subFields as SubField[] | undefined)?.filter((f) => f.name) || [];
    return (
      <div className="mb-5">
        {!bare && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">
              group
            </span>
          </div>
        )}
        <GroupField
          fieldName={path}
          subFields={subFields}
          register={register}
          control={control}
          errors={errors}
          watch={watch}
        />
      </div>
    );
  }

  // --- Flexible Content ---
  if (field.type === 'flexible') {
    const layouts =
      (field.options?.layouts as Layout[] | undefined)?.filter((l) => l.name) || [];
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-medium text-pink-600">
            flexible
          </span>
        </div>
        <FlexibleField
          fieldName={path}
          layouts={layouts}
          control={control}
          register={register}
          errors={errors}
          watch={watch}
        />
      </div>
    );
  }

  // --- Standard fields ---
  const renderControl = () => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            id={path}
            placeholder={t('form.enterValue', { field: label })}
            {...register(path, { required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={path}
            rows={3}
            placeholder={t('form.enterValue', { field: label })}
            {...register(path, { required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'richtext':
        return (
          <Controller
            control={control}
            name={path}
            render={({ field: f }) => (
              <RichTextEditor
                value={f.value || ''}
                onChange={f.onChange}
                placeholder={t('form.enterRichText', { field: label })}
              />
            )}
          />
        );

      case 'number':
        return (
          <Input
            id={path}
            type="number"
            placeholder={t('form.enterValue', { field: label })}
            {...register(path, { valueAsNumber: true, required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'boolean':
        return (
          <Controller
            control={control}
            name={path}
            render={({ field: f }) => (
              <div className="flex h-9 items-center justify-between rounded-md border border-input bg-background px-3">
                <span className="text-xs text-muted-foreground">
                  {f.value ? tc('enabled') : tc('disabled')}
                </span>
                <Switch
                  id={`switch-${path}`}
                  checked={!!f.value}
                  onCheckedChange={f.onChange}
                />
              </div>
            )}
          />
        );

      case 'select':
        return (
          <ChoiceSelect
            control={control}
            name={path}
            options={field.options as ChoiceOptions | undefined}
            placeholder={t('form.selectValue', { field: label })}
            invalid={!!error}
          />
        );

      case 'image':
        return (
          <Controller
            control={control}
            name={path}
            render={({ field: f }) => (
              <MediaPickerModal value={f.value ?? null} onChange={f.onChange} />
            )}
          />
        );

      case 'relation': {
        const relOpts = field.options as { relatedContentType?: string; cardinality?: string; mappedBy?: string } | undefined;
        if (relOpts?.mappedBy) {
          return (
            <ReverseRelationList
              entryId={entryId}
              field={field.name}
              relatedContentType={relOpts.relatedContentType ?? ''}
              mappedBy={relOpts.mappedBy}
            />
          );
        }
        return (
          <Controller
            control={control}
            name={path}
            render={({ field: f }) => (
              <RelationPicker
                relatedContentType={relOpts?.relatedContentType ?? ''}
                cardinality={(relOpts?.cardinality as 'one' | 'many') ?? 'one'}
                value={f.value ?? null}
                onChange={f.onChange}
              />
            )}
          />
        );
      }

      case 'color':
        return (
          <Controller
            control={control}
            name={path}
            render={({ field: f }) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={f.value || '#000000'}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
                />
                <Input
                  placeholder="#000000"
                  value={f.value || ''}
                  onChange={(e) => f.onChange(e.target.value)}
                  className={cn('flex-1 font-mono', error && 'border-destructive focus-visible:ring-destructive')}
                />
              </div>
            )}
          />
        );

      case 'date':
        return (
          <Input
            id={path}
            type="date"
            {...register(path, { required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'datetime':
        return (
          <Input
            id={path}
            type="datetime-local"
            {...register(path, { required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'json':
        return (
          <Controller
            control={control}
            name={path}
            defaultValue={{}}
            render={({ field: f }) => {
              const display = typeof f.value === 'string'
                ? f.value
                : JSON.stringify(f.value ?? {}, null, 2);
              return (
                <textarea
                  id={path}
                  rows={6}
                  value={display}
                  onChange={(e) => {
                    const raw = e.target.value;
                    try { f.onChange(JSON.parse(raw)); }
                    catch { f.onChange(raw); }
                  }}
                  onBlur={(e) => {
                    try { f.onChange(JSON.parse(e.target.value)); }
                    catch { /* leave as-is until user fixes */ }
                  }}
                  placeholder="{}"
                  className={cn(
                    'flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y',
                    error && 'border-destructive focus-visible:ring-destructive',
                  )}
                />
              );
            }}
          />
        );

      default:
        return (
          <Input
            id={path}
            placeholder={t('form.enterValue', { field: label })}
            {...register(path, { required: field.required ? t('form.fieldRequired', { field: label }) : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );
    }
  };

  return (
    <div className="space-y-1.5 mb-5">
      <Label
        htmlFor={field.type === 'boolean' ? `switch-${path}` : path}
        className="text-xs font-semibold text-foreground/90 flex items-center gap-1"
      >
        <span>{label}</span>
        {field.required && <span className="text-destructive font-normal" title={tc('required')}>*</span>}
      </Label>
      {renderControl()}
      {error && (
        <p className="mt-1 text-xs text-destructive">
          {error.message || t('form.required')}
        </p>
      )}
    </div>
  );
}
