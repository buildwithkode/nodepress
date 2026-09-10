'use client';

import React, { useState } from 'react';
import { useFieldArray, Controller, useWatch } from 'react-hook-form';
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
import { Trash2, GripVertical, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { MediaDropzone } from '@/components/MediaDropzone';

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
  control?: any,
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
          placeholder={`Enter ${toLabel(sf.name)}`}
          {...register(fieldPath)}
        />
      );
  }
}

// Individual sortable flexible block item
function SortableFlexibleItem({
  id,
  index,
  fieldName,
  layouts,
  control,
  register,
  onRemove,
  isCollapsed,
  onToggleCollapse,
}: {
  id: string;
  index: number;
  fieldName: string;
  layouts: Layout[];
  control: any;
  register: any;
  onRemove: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
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

  const layoutKey = `${fieldName}.${index}._layout`;
  const selectedLayoutName: string = useWatch({ control, name: layoutKey }) || '';
  const layout = layouts.find((l) => l.name === selectedLayoutName);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border bg-card/60 transition-all shadow-sm',
        'border-l-4 border-l-pink-500',
        isDragging && 'opacity-60 scale-[1.01] shadow-lg border-primary z-10',
      )}
    >
      {/* Card header with grip and accordion */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/20 border-b border-border/40 select-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Drag to reorder section"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <Badge variant="outline" className="border-pink-300 text-[10px] text-pink-600 px-1.5 py-0">
            #{index + 1}
          </Badge>

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
            <span>{layout?.label || layout?.name || 'Choose Section Layout'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            title="Remove section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Card Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-3.5">
          {/* Layout selector */}
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Section Type</Label>
            <Controller
              control={control}
              name={layoutKey}
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Choose section layout…" />
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
                          {renderSubInput(f.type, fieldPath, register, f, control)}
                          <Label className="text-xs font-medium">{sfLabel}</Label>
                        </div>
                      ) : (
                        <>
                          <Label className="mb-1 block text-xs font-medium text-muted-foreground">{sfLabel}</Label>
                          {renderSubInput(f.type, fieldPath, register, f, control)}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
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

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-2.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {fields.map((item, index) => (
              <SortableFlexibleItem
                key={item.id}
                id={item.id}
                index={index}
                fieldName={fieldName}
                layouts={layouts}
                control={control}
                register={register}
                onRemove={() => remove(index)}
                isCollapsed={!!collapsed[item.id]}
                onToggleCollapse={() => toggleCollapse(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add block selector */}
      <div className="mt-2">
        <Select
          value=""
          onValueChange={(val) => {
            if (val) append({ _layout: val });
          }}
        >
          <SelectTrigger className="w-full border-dashed text-muted-foreground h-9 text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            <SelectValue placeholder="+ Add Content Section / Layout Module…" />
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
