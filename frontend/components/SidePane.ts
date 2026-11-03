import type { CSSProperties } from 'react';

/**
 * The editors' form + side pane layout (JSON, reference, live preview).
 * From lg up they sit side by side, split at a draggable percentage. Below lg the pane stacks
 * above the form, right under the button that opened it, and starts closed (see isNarrowScreen).
 */
export const PANE_ROW = 'flex flex-col-reverse border-t border-border lg:flex-row';
export const MAIN_PANE = 'w-full min-w-0 px-4 py-4 lg:w-[var(--pane-w)] lg:px-6';
export const SIDE_PANE = 'w-full min-w-0 border-b border-border lg:w-[var(--pane-w)] lg:border-b-0 lg:border-l';
/** The inner box of a side pane: follows the window side by side, capped so the form stays reachable when stacked. */
export const SIDE_PANE_BODY = 'max-h-[60vh] lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)]';

export const paneWidth = (percent: number) => ({ '--pane-w': `${percent}%` }) as CSSProperties;

/** Below Tailwind's lg, where the panes stack. Browser only: call it from an effect. */
export const isNarrowScreen = () => window.matchMedia('(max-width: 1023px)').matches;
