'use client';

import dynamic from 'next/dynamic';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import RepeaterField from './RepeaterField';
import FlexibleField from './FlexibleField';
import GroupField from './GroupField';
import { MediaPickerModal } from '@/components/MediaPickerModal';
import { RelationPicker } from '@/components/RelationPicker';

const RichTextEditor = dynamic(
  () => import('@/components/RichTextEditor'),
  { ssr: false },
);

interface SubField {
  name: string;
  type: string;
}

interface Layout {
  name: string;
  label: string;
  fields: SubField[];
}

interface Field {
  name: string;
  type: string;
  options?: { subFields?: SubField[]; layouts?: Layout[]; choices?: string; relatedContentType?: string; cardinality?: string };
}

interface Props {
  field: Field;
  control: any;
  register: any;
  errors: any;
  watch?: any;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DynamicFormField({
  field,
  control,
  register,
  errors,
  watch,
}: Props) {
  const label = toLabel(field.name);
  const error = errors?.[field.name];

  // --- Repeater ---
  if (field.type === 'repeater') {
    const subFields =
      (field.options as { subFields?: SubField[] })?.subFields?.filter((f) => f.name) || [];
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">
            repeater
          </span>
        </div>
        <RepeaterField
          fieldName={field.name}
          subFields={subFields}
          control={control}
          register={register}
          errors={errors}
        />
      </div>
    );
  }

  // --- Group ---
  if (field.type === 'group') {
    const subFields =
      (field.options as { subFields?: SubField[] })?.subFields?.filter((f) => f.name) || [];
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">
            group
          </span>
        </div>
        <GroupField
          fieldName={field.name}
          subFields={subFields}
          register={register}
          control={control}
          errors={errors}
        />
      </div>
    );
  }

  // --- Flexible Content ---
  if (field.type === 'flexible') {
    const layouts =
      (field.options as { layouts?: Layout[] })?.layouts?.filter((l) => l.name) || [];
    return (
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-medium text-pink-600">
            flexible
          </span>
        </div>
        <FlexibleField
          fieldName={field.name}
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
            placeholder={`Enter ${label}`}
            {...register(field.name)}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'textarea':
        return (
          <Textarea
            rows={3}
            placeholder={`Enter ${label}`}
            {...register(field.name)}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'richtext':
        return (
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <RichTextEditor
                value={f.value || ''}
                onChange={f.onChange}
                placeholder={`Enter ${label}`}
              />
            )}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            placeholder={`Enter ${label}`}
            {...register(field.name, { valueAsNumber: true })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'boolean':
        return (
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <div className="flex items-center gap-2">
                <Switch
                  id={`switch-${field.name}`}
                  checked={!!f.value}
                  onCheckedChange={f.onChange}
                />
                <label
                  htmlFor={`switch-${field.name}`}
                  className="cursor-pointer select-none text-sm text-muted-foreground"
                >
                  {f.value ? 'Enabled' : 'Disabled'}
                </label>
              </div>
            )}
          />
        );

      case 'select': {
        const opts = field.options as { choices?: string | string[] } | undefined;
        const choices = opts?.choices ?? '';
        const selectOptions = (
          Array.isArray(choices)
            ? choices
            : String(choices).split(',')
        )
          .map((o) => o.trim())
          .filter(Boolean)
          .map((o) => ({ label: o, value: o }));
        return (
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <Select value={f.value ?? ''} onValueChange={f.onChange}>
                <SelectTrigger
                  className={cn(error && 'border-destructive focus:ring-destructive')}
                >
                  <SelectValue placeholder={`Select ${label}`} />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        );
      }

      case 'image':
        return (
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <MediaPickerModal value={f.value ?? null} onChange={f.onChange} />
            )}
          />
        );

      case 'relation': {
        const relOpts = field.options as { relatedContentType?: string; cardinality?: string } | undefined;
        return (
          <Controller
            control={control}
            name={field.name}
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
            name={field.name}
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
          <input
            type="date"
            {...register(field.name)}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              error && 'border-destructive focus-visible:ring-destructive',
            )}
          />
        );

      case 'datetime':
        return (
          <input
            type="datetime-local"
            {...register(field.name)}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              error && 'border-destructive focus-visible:ring-destructive',
            )}
          />
        );

      case 'json':
        return (
          <Controller
            control={control}
            name={field.name}
            defaultValue={{}}
            render={({ field: f }) => {
              const display = typeof f.value === 'string'
                ? f.value
                : JSON.stringify(f.value ?? {}, null, 2);
              return (
                <textarea
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
            placeholder={`Enter ${label}`}
            {...register(field.name)}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );
    }
  };

  return (
    <div className="mb-4">
      {field.type !== 'boolean' && (
        <Label className="mb-1.5 block text-sm font-medium">{label}</Label>
      )}
      {renderControl()}
      {error && (
        <p className="mt-1 text-xs text-destructive">
          {error.message || 'This field is required'}
        </p>
      )}
    </div>
  );
}
