'use client';

import { useFieldArray, Controller, useWatch } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SubFields, type SubField } from './SubFields';

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

// Individual flexible block item
function FlexibleItem({
  index,
  fieldName,
  layouts,
  control,
  register,
  errors,
  watch,
  onRemove,
}: {
  index: number;
  fieldName: string;
  layouts: Layout[];
  control: any;
  register: any;
  errors: any;
  watch: any;
  onRemove: () => void;
}) {
  const t = useTranslations('entryEditor');
  const layoutKey = `${fieldName}.${index}._layout`;
  const selectedLayoutName: string = useWatch({ control, name: layoutKey }) || '';
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
            {layout?.label || layout?.name || t('flexible.selectLayout')}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRemove}
          title={t('flexible.removeBlock')}
          aria-label={t('flexible.removeBlock')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Layout selector */}
      <div className="mb-3">
        <Label className="mb-1 block text-xs text-muted-foreground">{t('flexible.sectionType')}</Label>
        <Controller
          control={control}
          name={layoutKey}
          rules={{ required: true }}
          render={({ field }) => (
            <Select value={field.value || ''} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('flexible.chooseLayout')} />
              </SelectTrigger>
              <SelectContent>
                {layouts.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    {l.label || l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Render selected layout's fields */}
      {layout && (
        <div className="border-t pt-3">
          <SubFields path={`${fieldName}.${index}`} fields={layout.fields} control={control} register={register} errors={errors} watch={watch} />
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
  const t = useTranslations('entryEditor');
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
          errors={errors}
          watch={watch}
          onRemove={() => remove(index)}
        />
      ))}

      {/* Add block selector */}
      <div className="mt-1">
        <Select
          value=""
          onValueChange={(val) => {
            if (val) append({ _layout: val });
          }}
        >
          <SelectTrigger className="w-full border-dashed text-muted-foreground">
            <SelectValue placeholder={t('flexible.addBlock')} />
          </SelectTrigger>
          <SelectContent>
            {layouts.map((l) => (
              <SelectItem key={l.name} value={l.name}>
                + {l.label || l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
