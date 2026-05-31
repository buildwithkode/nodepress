'use client';

import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MediaPickerModal } from '@/components/MediaPickerModal';

interface SubField {
  name: string;
  type: string;
}

interface Props {
  fieldName: string;
  subFields: SubField[];
  register: any;
  control: any;
  errors: any;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderSubInput(type: string, path: string, register: any, control: any, sf: SubField) {
  const fieldPath = `${path}.${sf.name}`;
  switch (type) {
    case 'textarea':
      return <Textarea rows={2} placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath)} />;
    case 'number':
      return <Input type="number" placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath, { valueAsNumber: true })} />;
    case 'boolean':
      return <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...register(fieldPath)} />;
    case 'image':
      return (
        <Controller
          control={control}
          name={fieldPath}
          render={({ field: f }) => (
            <MediaPickerModal value={f.value ?? null} onChange={f.onChange} />
          )}
        />
      );
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name={fieldPath}
            render={({ field: f }) => (
              <>
                <input
                  type="color"
                  value={f.value || '#000000'}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
                />
                <Input
                  placeholder="#000000"
                  value={f.value || ''}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
              </>
            )}
          />
        </div>
      );
    case 'date':
      return (
        <input
          type="date"
          {...register(fieldPath)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          {...register(fieldPath)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      );
    case 'json':
      return (
        <Controller
          control={control}
          name={fieldPath}
          defaultValue={{}}
          render={({ field: f }) => {
            const display = typeof f.value === 'string' ? f.value : JSON.stringify(f.value ?? {}, null, 2);
            return (
              <textarea
                rows={3}
                value={display}
                onChange={(e) => {
                  const raw = e.target.value;
                  try { f.onChange(JSON.parse(raw)); } catch { f.onChange(raw); }
                }}
                onBlur={(e) => {
                  try { f.onChange(JSON.parse(e.target.value)); } catch { /* leave as-is */ }
                }}
                placeholder="{}"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              />
            );
          }}
        />
      );
    default:
      return <Input type="text" placeholder={sf.name.replace(/_/g, ' ')} {...register(fieldPath)} />;
  }
}

export default function GroupField({ fieldName, subFields, register, control, errors }: Props) {
  return (
    <div className="rounded-md border border-violet-400/40 border-l-4 border-l-violet-400 bg-muted/30 p-3 space-y-3">
      {subFields.map((sf) => {
        const sfLabel = toLabel(sf.name);
        return (
          <div key={sf.name}>
            {sf.type === 'boolean' ? (
              <div className="flex items-center gap-2">
                {renderSubInput(sf.type, fieldName, register, control, sf)}
                <Label className="text-sm">{sfLabel}</Label>
              </div>
            ) : (
              <>
                <Label className="mb-1 block text-sm">{sfLabel}</Label>
                {renderSubInput(sf.type, fieldName, register, control, sf)}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
