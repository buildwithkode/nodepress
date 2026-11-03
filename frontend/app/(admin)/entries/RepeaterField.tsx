'use client';

import { useId } from 'react';
import { useFieldArray } from 'react-hook-form';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Trash2, Plus } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { SortableItem, useDragSensors } from '@/components/SortableItem';
import { cn } from '@/lib/utils';
import { SubFields, type SubField } from './SubFields';

interface Props {
  fieldName: string;
  subFields: SubField[];
  control: any;
  register: any;
  errors: any;
  watch?: any;
}
export default function RepeaterField({
  fieldName,
  subFields,
  control,
  register,
  errors,
  watch,
}: Props) {
  const t = useTranslations('entryEditor');
  const { fields, append, remove, move } = useFieldArray({ control, name: fieldName });
  const dndId = useId();
  const sensors = useDragSensors();
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(fields.findIndex((f) => f.id === active.id), fields.findIndex((f) => f.id === over.id));
  };

  return (
    <div className="space-y-2">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-2">
      {fields.map((item, index) => (
        <SortableItem key={item.id} id={item.id}>
        {(dragHandle) => (
        <div
          className={cn(
            'rounded-md border bg-muted/30 p-3',
            'border-l-4 border-l-orange-400',
          )}
        >
          {/* Card header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {fields.length > 1 && dragHandle}
              <span className="text-xs font-medium text-muted-foreground">
                {t('repeater.item', { number: index + 1 })}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => remove(index)}
              title={t('repeater.removeItem')}
              aria-label={t('repeater.removeItem')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Sub-fields */}
          <SubFields path={`${fieldName}.${index}`} fields={subFields} control={control} register={register} errors={errors} watch={watch} />
        </div>
        )}
        </SortableItem>
      ))}
      </div>
      </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 w-full border-dashed"
        onClick={() => append({})}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('repeater.addItem')}
      </Button>
    </div>
  );
}
