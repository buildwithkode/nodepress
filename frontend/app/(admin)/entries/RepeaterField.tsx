'use client';

import { useId, type ReactNode } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { SortableItem, useDragSensors } from '@/components/SortableItem';
import { SubFields, type SubField } from './SubFields';
import { ExpandCollapseAll, useOpenRows } from '@/components/OpenRows';
import { CollapsibleRow, rowPreview } from './CollapsibleRow';

interface Props {
  fieldName: string;
  subFields: SubField[];
  control: any;
  register: any;
  errors: any;
  watch?: any;
}

function RepeaterRow({ path, index, subFields, control, register, errors, watch, open, onOpenChange, onRemove, dragHandle }: {
  path: string;
  index: number;
  subFields: SubField[];
  control: any;
  register: any;
  errors: any;
  watch?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  dragHandle?: ReactNode;
}) {
  const t = useTranslations('entryEditor');
  const row = useWatch({ control, name: path });
  return (
    <CollapsibleRow
      path={path}
      open={open}
      onOpenChange={onOpenChange}
      control={control}
      errors={errors}
      className="border-l-orange-400"
      dragHandle={dragHandle}
      title={t('repeater.item', { number: index + 1 })}
      preview={rowPreview(subFields, row)}
      removeLabel={t('repeater.removeItem')}
      onRemove={onRemove}
    >
      <SubFields path={path} fields={subFields} control={control} register={register} errors={errors} watch={watch} />
    </CollapsibleRow>
  );
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
  const rows = useOpenRows(fields.map((f) => f.id));
  const dndId = useId();
  const sensors = useDragSensors();
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(fields.findIndex((f) => f.id === active.id), fields.findIndex((f) => f.id === over.id));
  };

  return (
    <div className="space-y-2">
      <ExpandCollapseAll count={fields.length} onChange={rows.setAllOpen} />
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-2">
      {fields.map((item, index) => (
        <SortableItem key={item.id} id={item.id}>
        {(dragHandle) => (
        <RepeaterRow
          path={`${fieldName}.${index}`}
          index={index}
          subFields={subFields}
          control={control}
          register={register}
          errors={errors}
          watch={watch}
          open={rows.isOpen(item.id)}
          onOpenChange={(open) => rows.setRowOpen(item.id, open)}
          onRemove={() => remove(index)}
          dragHandle={fields.length > 1 ? dragHandle : undefined}
        />
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
        onClick={() => { rows.markAdding(); append({}); }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('repeater.addItem')}
      </Button>
    </div>
  );
}
