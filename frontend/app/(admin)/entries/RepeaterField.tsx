'use client';

import { useFieldArray } from 'react-hook-form';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SubField {
  name: string;
  type: string;
}

interface Props {
  fieldName: string;
  subFields: SubField[];
  control: any;
  register: any;
  errors: any;
}

function renderSubInput(
  type: string,
  path: string,
  register: any,
  control: any,
  index: number,
  sf: SubField,
) {
  const fieldPath = `${path}.${sf.name}`;

  switch (type) {
    case 'textarea':
      return (
        <Textarea
          rows={2}
          placeholder={sf.name.replace(/_/g, ' ')}
          {...register(fieldPath)}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          placeholder={sf.name.replace(/_/g, ' ')}
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
      // Boolean in repeater items is handled inline via register as a checkbox
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
          placeholder={sf.name.replace(/_/g, ' ')}
          {...register(fieldPath)}
        />
      );
  }
}

export default function RepeaterField({
  fieldName,
  subFields,
  control,
  register,
  errors,
}: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: fieldName });

  const toLabel = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-2">
      {fields.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            'rounded-md border bg-muted/30 p-3',
            'border-l-4 border-l-orange-400',
          )}
        >
          {/* Card header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Item {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => remove(index)}
              title="Remove item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Sub-fields */}
          <div className="space-y-3">
            {subFields.map((sf) => {
              const itemPath = `${fieldName}.${index}`;
              const sfLabel = toLabel(sf.name);
              return (
                <div key={sf.name}>
                  {sf.type === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      {renderSubInput(sf.type, itemPath, register, control, index, sf)}
                      <Label className="text-sm">{sfLabel}</Label>
                    </div>
                  ) : (
                    <>
                      <Label className="mb-1 block text-sm">{sfLabel}</Label>
                      {renderSubInput(sf.type, itemPath, register, control, index, sf)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 w-full border-dashed"
        onClick={() => append({})}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Item
      </Button>
    </div>
  );
}
