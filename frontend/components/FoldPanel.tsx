'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** How long a fold takes to open or close, in ms. Matches `duration-200` below. */
export const FOLD_MS = 200;

interface Props {
  open: boolean;
  /** Classes for the content box (spacing between the header and the content goes here, so it folds too). */
  className?: string;
  /** Don't render the content until it's first opened (it stays mounted after that). */
  lazy?: boolean;
  children: ReactNode;
}

/**
 * The body of a folding row, sliding open and shut. The content stays mounted when closed —
 * React Hook Form skips validation of unmounted inputs, and nested editors keep their state —
 * but is `inert` and invisible, so it can't be tabbed into or read out. While fully open the
 * content isn't clipped, so menus and toolbars inside it can overflow the row.
 */
export function FoldPanel({ open, className, lazy, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  const render = !lazy || opened;
  // Fully open and done animating: only then is overflow let out.
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    // React 18 doesn't know the `inert` prop, so set the attribute directly.
    ref.current?.toggleAttribute('inert', !open);
    if (!open) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), FOLD_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn(
        'grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
      )}
    >
      <div className={cn('min-h-0', !settled && 'overflow-hidden')}>
        {render && <div className={className}>{children}</div>}
      </div>
    </div>
  );
}
