'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAnimate } from 'motion/react-mini';

const DURATION = 0.24;
const EASE = [0.22, 1, 0.36, 1] as const;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The space between this row and its neighbour, so it closes with the row instead of jumping at
 * the end. Lists space their items with `space-y-*` (margin-top on every item but the first), and
 * the row is the only child of its list item (e.g. a SortableItem).
 */
function gapOf(el: HTMLElement): { side: 'marginTop' | 'marginBottom'; gap: number } {
  const item = el.parentElement;
  if (!item) return { side: 'marginTop', gap: 0 };
  const own = parseFloat(getComputedStyle(item).marginTop) || 0;
  if (own) return { side: 'marginTop', gap: own };
  const next = item.nextElementSibling;
  return { side: 'marginBottom', gap: next ? parseFloat(getComputedStyle(next).marginTop) || 0 : 0 };
}

function clear(el: HTMLElement) {
  for (const prop of ['height', 'opacity', 'overflow', 'margin-top', 'margin-bottom']) el.style.removeProperty(prop);
}

interface Props {
  /** Slide in when mounted: true only for a row the editor has just added, not on page load. */
  appear?: boolean;
  /** Renders the row; call `leave(done)` to slide it out, then `done` removes it. */
  children: (leave: (done: () => void) => void) => ReactNode;
}

/**
 * A list row that slides in when added and out when removed (Motion's small WAAPI build). The row
 * is removed from the list only after it has slid out, so a form library never shows another
 * row's values in a row on its way out. With reduced motion it appears and goes at once.
 */
export function AnimatedRow({ appear, children }: Props) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const leaving = useRef(false);

  useLayoutEffect(() => {
    const el = scope.current;
    if (!appear || !el || reducedMotion()) return;
    const { side, gap } = gapOf(el);
    el.style.overflow = 'hidden';
    const controls = animate(
      el,
      { height: ['0px', `${el.offsetHeight}px`], opacity: [0, 1], [side]: [`${-gap}px`, '0px'] },
      { duration: DURATION, ease: EASE },
    );
    controls.then(() => clear(el));
    // Stopped early (unmounted, or React's dev double run): leave no half-animated styles behind.
    return () => {
      controls.stop();
      clear(el);
    };
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = (done: () => void) => {
    const el = scope.current;
    if (leaving.current) return;
    if (!el || reducedMotion()) return done();
    leaving.current = true;
    const { side, gap } = gapOf(el);
    el.style.overflow = 'hidden';
    animate(
      el,
      { height: [`${el.offsetHeight}px`, '0px'], opacity: [1, 0], [side]: ['0px', `${-gap}px`] },
      { duration: DURATION, ease: EASE },
    ).then(() => {
      // Hold the closed state until React removes the row.
      el.style.height = '0px';
      el.style.opacity = '0';
      el.style[side] = `${-gap}px`;
      done();
      // If the row is still there (nothing removed it), show it again.
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        clear(el);
        leaving.current = false;
      });
    });
  };

  return <div ref={scope}>{children(leave)}</div>;
}
