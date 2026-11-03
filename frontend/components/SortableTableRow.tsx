'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * A table row with a Sr. No. cell and a drag handle, for a list inside DndContext + SortableContext.
 * Keep it from dragging (canDrag) when the rows on screen aren't the whole list, like search results.
 */
export function SortableTableRow({ id, number, canDrag, handleLabel, numberCellClassName, children }: {
  id: number;
  number: number;
  canDrag: boolean;
  handleLabel: string;
  numberCellClassName?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  return (
    <tr
      ref={setNodeRef}
      data-slot="table-row"
      className={`border-b border-border hover:bg-muted/20 transition-colors ${isDragging ? 'relative z-10 bg-muted' : ''}`}
      // Up and down only, without stretching the row to the height of the one it passes.
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
    >
      <TableCell className={cn('align-top py-3 whitespace-nowrap', numberCellClassName)}>
        <div className="flex items-center gap-1.5">
          {canDrag && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={handleLabel}
              title={handleLabel}
              className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 hover:text-muted-foreground"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="tabular-nums text-muted-foreground">{number}</span>
        </div>
      </TableCell>
      {children}
    </tr>
  );
}
