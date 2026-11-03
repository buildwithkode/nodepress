'use client';

import { useId, type ReactNode } from 'react';
import { useFieldArray, Controller, useWatch } from 'react-hook-form';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslations } from 'use-intl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SortableItem, useDragSensors } from '@/components/SortableItem';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SubFields, type SubField } from './SubFields';
import { ExpandCollapseAll, useOpenRows } from '@/components/OpenRows';
import { CollapsibleRow, rowPreview } from './CollapsibleRow';

/** Mirrors SECTION_KEY_RE in backend/src/common/section-keys.ts. */
const SECTION_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
/** What an editor types, as a key: `Footer Magic` → `footer_magic`. */
const toSectionKey = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, '_');

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
  dragHandle,
  open,
  onOpenChange,
}: {
  index: number;
  fieldName: string;
  layouts: Layout[];
  control: any;
  register: any;
  errors: any;
  watch: any;
  onRemove: () => void;
  dragHandle?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('entryEditor');
  const layoutKey = `${fieldName}.${index}._layout`;
  const sectionKeyName = `${fieldName}.${index}._key`;
  const sectionKeyError = errors?.[fieldName]?.[index]?._key?.message as string | undefined;
  const selectedLayoutName: string = useWatch({ control, name: layoutKey }) || '';
  const layout = layouts.find((l) => l.name === selectedLayoutName);
  // A layout used more than once in this field needs a key on each of its sections.
  const items: any[] = useWatch({ control, name: fieldName }) ?? [];
  const sameLayout = items.filter((it) => it?._layout && it._layout === selectedLayoutName).length;
  const keyRequired = sameLayout > 1;
  const currentKey: string = items[index]?._key ?? '';

  return (
    <CollapsibleRow
      path={`${fieldName}.${index}`}
      open={open}
      onOpenChange={onOpenChange}
      control={control}
      errors={errors}
      className="border-l-pink-500"
      dragHandle={dragHandle}
      title={<>
        <Badge variant="outline" className="border-pink-300 text-xs text-pink-600">{index + 1}</Badge>
        {layout?.label || layout?.name || t('flexible.selectLayout')}
      </>}
      preview={rowPreview(layout?.fields, items[index])}
      removeLabel={t('flexible.removeBlock')}
      onRemove={onRemove}
    >
      {/* Section key: site code reads the section as <field>_by_key.<key> (or by its layout name when used once) */}
      <div className="mb-3">
        <Label className="mb-1 block text-xs text-muted-foreground">
          {keyRequired ? <>{t('flexible.sectionKeyRequiredLabel')} <span className="text-destructive">*</span></> : t('flexible.sectionKey')}
        </Label>
        <Controller
          control={control}
          name={sectionKeyName}
          rules={{
            validate: (v: unknown, values: any) => {
              const key = typeof v === 'string' ? v : '';
              const all: unknown[] = values?.[fieldName] ?? [];
              const layoutName = (all[index] as any)?._layout;
              if (!key) {
                const repeats = all.filter((it: any) => it && it._layout === layoutName).length > 1;
                return repeats ? t('flexible.sectionKeyRequired', { layout: layouts.find((l) => l.name === layoutName)?.label || layoutName }) : true;
              }
              if (!SECTION_KEY_RE.test(key)) return t('flexible.sectionKeyInvalid');
              const same = all.filter((it: any) => it && it._key === key).length;
              return same > 1 ? t('flexible.sectionKeyDuplicate', { key }) : true;
            },
          }}
          render={({ field }) => (
            <Input
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={() => { field.onChange(toSectionKey(field.value ?? '')); field.onBlur(); }}
              placeholder={t('flexible.sectionKeyPlaceholder')}
              aria-invalid={!!sectionKeyError}
              className="h-8 font-mono text-xs"
            />
          )}
        />
        {sectionKeyError
          ? <p className="mt-1 text-xs text-destructive">{sectionKeyError}</p>
          : <p className="mt-1 text-xs text-muted-foreground">
              {currentKey || keyRequired || !selectedLayoutName
                ? t('flexible.sectionKeyHint', { field: fieldName })
                : t('flexible.sectionKeyLayoutHint', { field: fieldName, layout: selectedLayoutName })}
            </p>}
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
    </CollapsibleRow>
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
        <FlexibleItem
          index={index}
          fieldName={fieldName}
          layouts={layouts}
          control={control}
          register={register}
          errors={errors}
          watch={watch}
          onRemove={() => remove(index)}
          dragHandle={fields.length > 1 ? dragHandle : undefined}
          open={rows.isOpen(item.id)}
          onOpenChange={(open) => rows.setRowOpen(item.id, open)}
        />
        )}
        </SortableItem>
      ))}
      </div>
      </SortableContext>
      </DndContext>

      {/* Add block selector */}
      <div className="mt-1">
        <Select
          value=""
          onValueChange={(val) => {
            if (val) { rows.markAdding(); append({ _layout: val }); }
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
