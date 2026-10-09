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
import { Link2, ExternalLink } from 'lucide-react';

const RichTextEditor = dynamic(
  () => import('@/components/RichTextEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="h-44 w-full rounded-md border border-input bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
        Loading editor…
      </div>
    ),
  },
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
  label?: string;
  type: string;
  required?: boolean;
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
  const label = field.label?.trim() || toLabel(field.name);
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
            id={field.name}
            placeholder={`Enter ${label}…`}
            {...register(field.name, { required: field.required ? `${label} is required` : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={field.name}
            rows={3}
            placeholder={`Enter ${label}…`}
            {...register(field.name, { required: field.required ? `${label} is required` : false })}
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
            id={field.name}
            type="number"
            placeholder={`Enter ${label}…`}
            {...register(field.name, { valueAsNumber: true, required: field.required ? `${label} is required` : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'boolean':
        return (
          <Controller
            control={control}
            name={field.name}
            render={({ field: f }) => (
              <div className="flex h-9 items-center justify-between rounded-md border border-input bg-background px-3">
                <span className="text-xs text-muted-foreground">
                  {f.value ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  id={`switch-${field.name}`}
                  checked={!!f.value}
                  onCheckedChange={f.onChange}
                />
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

      case 'link':
        return (
          <Controller
            control={control}
            name={field.name}
            defaultValue={{ url: '', text: '', newTab: false }}
            render={({ field: f }) => {
              const val = typeof f.value === 'object' && f.value !== null
                ? f.value
                : { url: typeof f.value === 'string' ? f.value : '', text: '', newTab: false };
              return (
                <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Link2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id={`${field.name}-url`}
                        placeholder="https://example.com or /path"
                        value={val.url || ''}
                        onChange={(e) => f.onChange({ ...val, url: e.target.value })}
                        className="pl-8 text-xs font-mono"
                      />
                    </div>
                    <Input
                      id={`${field.name}-text`}
                      placeholder="Display text (optional)"
                      value={val.text || ''}
                      onChange={(e) => f.onChange({ ...val, text: e.target.value })}
                      className="sm:w-1/3 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <label
                      htmlFor={`newtab-${field.name}`}
                      className="flex cursor-pointer items-center gap-2 select-none"
                    >
                      <input
                        type="checkbox"
                        id={`newtab-${field.name}`}
                        checked={!!(val.newTab ?? val.newtab)}
                        onChange={(e) => f.onChange({ ...val, newTab: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-muted-foreground/30 accent-primary"
                      />
                      <span>Open in new tab (<code className="text-[10px]">_blank</code>)</span>
                    </label>
                    {val.url && (
                      <a
                        href={val.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Test Link
                      </a>
                    )}
                  </div>
                </div>
              );
            }}
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
          <Input
            id={field.name}
            type="date"
            {...register(field.name, { required: field.required ? `${label} is required` : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );

      case 'datetime':
        return (
          <Input
            id={field.name}
            type="datetime-local"
            {...register(field.name, { required: field.required ? `${label} is required` : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
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
                  id={field.name}
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
            id={field.name}
            placeholder={`Enter ${label}…`}
            {...register(field.name, { required: field.required ? `${label} is required` : false })}
            className={cn(error && 'border-destructive focus-visible:ring-destructive')}
          />
        );
    }
  };

  return (
    <div className="space-y-1.5 mb-5">
      <Label
        htmlFor={field.type === 'boolean' ? `switch-${field.name}` : field.name}
        className="text-xs font-semibold text-foreground/90 flex items-center gap-1"
      >
        <span>{label}</span>
        {field.required && <span className="text-destructive font-normal" title="Required">*</span>}
      </Label>
      {renderControl()}
      {error && (
        <p className="mt-1 text-xs text-destructive">
          {error.message || 'This field is required'}
        </p>
      )}
    </div>
  );
}
