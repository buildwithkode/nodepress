import type { CSSProperties } from 'react';

/**
 * The editors' form + side pane layout (JSON, reference, live preview).
 * From lg up they sit side by side, split at a draggable percentage. Below lg the pane stacks
 * above the form, right under the button that opened it, and starts closed (see isNarrowScreen).
 */
export const PANE_ROW = 'flex flex-col-reverse border-t border-border lg:flex-row';
export const MAIN_PANE = 'w-full min-w-0 px-4 py-4 lg:w-[var(--pane-w)] lg:px-6';
export const SIDE_PANE = 'w-full min-w-0 border-b border-border lg:w-[var(--pane-w)] lg:border-b-0 lg:border-l';
/**
 * The inner box of a side pane: follows the window side by side, capped so the form stays reachable when stacked.
 * --sticky-header-h is the height of a sticky editor header above it, when the page has one.
 */
export const SIDE_PANE_BODY = 'max-h-[60vh] lg:sticky lg:top-[calc(3.5rem+var(--sticky-header-h,0px))] lg:max-h-[calc(100vh-3.5rem-var(--sticky-header-h,0px))]';

/**
 * An editor's header (title and Save) stays in view from lg up, just below the top bar (h-14).
 * Goes on a wrapper around CardHeader, and the row below it takes STICKY_PANE_ROW and useStickyHeader's paneRowStyle.
 */
export const STICKY_HEADER = 'rounded-t-xl bg-card lg:sticky lg:top-14 lg:z-20 lg:-mt-6 lg:-mb-6 lg:border-b lg:border-border lg:py-4';
export const STICKY_PANE_ROW = `${PANE_ROW} lg:border-t-0`;

export const paneWidth = (percent: number) => ({ '--pane-w': `${percent}%` }) as CSSProperties;

/** Below Tailwind's lg, where the panes stack. Browser only: call it from an effect. */
export const isNarrowScreen = () => window.matchMedia('(max-width: 1023px)').matches;
