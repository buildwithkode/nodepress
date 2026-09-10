'use client';

import React, { useState } from 'react';
import { useFieldArray, Controller } from 'react-hook-form';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Plus, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MediaDropzone } from '@/components/MediaDropzone';

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
        <Controller
          control={control}
          name={fieldPath}
          render={({ field: f }) => (
            <MediaDropzone value={f.value ?? null} onChange={f.onChange} />
          )}
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
      return (
        <Input
          type="text"
          placeholder={sf.name.replace(/_/g, ' ')}
          {...register(fieldPath)}
        />
      );
  }
}

interface SortableItemProps {
  id: string;
  index: number;
  fieldName: string;
  subFields: SubField[];
  control: any;
  register: any;
  onRemove: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  toLabel: (name: string) => string;
}

function SortableRepeaterItem({
  id,
  index,
  fieldName,
  subFields,
  control,
  register,
  onRemove,
  isCollapsed,
  onToggleCollapse,
  toLabel,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const itemPath = `${fieldName}.${index}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border bg-card/60 transition-all shadow-sm',
        'border-l-4 border-l-orange-400',
        isDragging && 'opacity-60 scale-[1.01] shadow-lg border-primary z-10',
      )}
    >
      {/* Header with drag grip and collapse */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/20 border-b border-border/40 select-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span>Item #{index + 1}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            title="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Item Body */}
      {!isCollapsed && (
        <div className="p-4 space-y-3.5">
          {subFields.map((sf) => {
            const sfLabel = toLabel(sf.name);
            return (
              <div key={sf.name}>
                {sf.type === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    {renderSubInput(sf.type, itemPath, register, control, index, sf)}
                    <Label className="text-xs font-medium">{sfLabel}</Label>
                  </div>
                ) : (
                  <>
                    <Label className="mb-1 block text-xs font-medium text-muted-foreground">{sfLabel}</Label>
                    {renderSubInput(sf.type, itemPath, register, control, index, sf)}
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

export default function RepeaterField({
  fieldName,
  subFields,
  control,
  register,
  errors,
}: Props) {
  const { fields, append, remove, move } = useFieldArray({ control, name: fieldName });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((item) => item.id === active.id);
      const newIndex = fields.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  };

  const toLabel = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-2.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {fields.map((item, index) => (
              <SortableRepeaterItem
                key={item.id}
                id={item.id}
                index={index}
                fieldName={fieldName}
                subFields={subFields}
                control={control}
                register={register}
                onRemove={() => remove(index)}
                isCollapsed={!!collapsed[item.id]}
                onToggleCollapse={() => toggleCollapse(item.id)}
                toLabel={toLabel}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full border-dashed gap-1.5 h-9 text-xs"
        onClick={() => append({})}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Item
      </Button>
    </div>
  );
}
