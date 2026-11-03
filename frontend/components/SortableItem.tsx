'use client';

import type { ReactNode } from 'react';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslations } from 'use-intl';

/** Drag by mouse, touch or keyboard. A small move is still a click. */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * One card in a vertical list inside DndContext + SortableContext. It hands its drag handle to
 * `children` to place in the card's header, and moves up and down only, without stretching to
 * the height of the card it passes.
 */
export function SortableItem({ id, children }: { id: string; children: (dragHandle: ReactNode) => ReactNode }) {
  const t = useTranslations('contentTypes');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dragHandle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t('list.dragToReorder')}
      title={t('list.dragToReorder')}
      className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 hover:text-muted-foreground"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'relative z-10' : undefined}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
    >
      {children(dragHandle)}
    </div>
  );
}
