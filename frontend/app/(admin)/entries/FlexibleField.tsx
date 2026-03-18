'use client';

import { useFieldArray } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SubField {
  name: string;
  type: string;
}

interface Layout {
  name: string;
  label?: string;
  fields: SubField[];
}

interface Props {
  fieldName: string;
  layouts: Layout[];
  control: any;
  register: any;
  errors: any;
  watch: any;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderSubInput(
  type: string,
  fieldPath: string,
  register: any,
  sf: SubField,
) {
  switch (type) {
    case 'textarea':
    case 'richtext':
      return (
        <Textarea
          rows={type === 'richtext' ? 4 : 2}
          placeholder={`Enter ${toLabel(sf.name)}`}
          {...register(fieldPath)}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          placeholder={`Enter ${toLabel(sf.name)}`}
          {...register(fieldPath, { valueAsNumber: true })}
        />
      );
    case 'image':
      return (
        <Input
          type="text"
          placeholder="Image URL"
          {...register(fieldPath)}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          {...register(fieldPath)}
        />
      );
    default:
      return (
        <Input
          type="text"
          placeholder={`Enter ${toLabel(sf.name)}`}
          {...register(fieldPath)}
        />
      );
  }
}

// Individual flexible block item
function FlexibleItem({
  index,
  fieldName,
  layouts,
  control,
  register,
  watch,
  onRemove,
}: {
  index: number;
  fieldName: string;
  layouts: Layout[];
  control: any;
  register: any;
  watch: any;
  onRemove: () => void;
}) {
  const layoutKey = `${fieldName}.${index}._layout`;
  const selectedLayoutName: string = watch(layoutKey) || '';
  const layout = layouts.find((l) => l.name === selectedLayoutName);

  return (
    <div
      className={cn(
        'rounded-md border bg-muted/30 p-3',
        'border-l-4 border-l-pink-500',
      )}
    >
      {/* Card header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-pink-300 text-xs text-pink-600">
            {index + 1}
          </Badge>
          <span className="text-sm font-medium text-muted-foreground">
            {layout?.label || layout?.name || 'Select a layout'}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={onRemove}
          title="Remove block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Layout selector */}
      <div className="mb-3">
        <Label className="mb-1 block text-xs text-muted-foreground">Section Type</Label>
        <select
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring',
          )}
          {...register(layoutKey, { required: true })}
        >
          <option value="">Choose section layout…</option>
          {layouts.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label || l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Render selected layout's fields */}
      {layout && (
        <div className="space-y-3 border-t pt-3">
          {layout.fields
            .filter((f) => f.name)
            .map((f) => {
              const fieldPath = `${fieldName}.${index}.${f.name}`;
              const sfLabel = toLabel(f.name);
              return (
                <div key={f.name}>
                  {f.type === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      {renderSubInput(f.type, fieldPath, register, f)}
                      <Label className="text-sm">{sfLabel}</Label>
                    </div>
                  ) : (
                    <>
                      <Label className="mb-1 block text-sm">{sfLabel}</Label>
                      {renderSubInput(f.type, fieldPath, register, f)}
                    </>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export default function FlexibleField({
  fieldName,
  layouts,
  control,
  register,
  errors,
  watch,
}: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: fieldName });

  return (
    <div className="space-y-2">
      {fields.map((item, index) => (
        <FlexibleItem
          key={item.id}
          index={index}
          fieldName={fieldName}
          layouts={layouts}
          control={control}
          register={register}
          watch={watch}
          onRemove={() => remove(index)}
        />
      ))}

      {/* Add block selector */}
      <div className="mt-1">
        <select
          className={cn(
            'w-full rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground',
            'ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring',
            'cursor-pointer hover:bg-accent hover:text-accent-foreground',
          )}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              append({ _layout: e.target.value });
              e.target.value = '';
            }
          }}
        >
          <option value="">+ Add Block…</option>
          {layouts.map((l) => (
            <option key={l.name} value={l.name}>
              + {l.label || l.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
