/**
 * Live preview helpers for a site shown in the NodePress entry editor's
 * preview pane (an iframe of the content type's preview URL).
 *
 *   import { onPreviewUpdate, enableClickToEdit } from '@nodepress-cms/client/preview';
 *
 *   const stop = onPreviewUpdate((msg) => render(msg.data), { adminOrigin: 'https://cms.example.com' });
 *   enableClickToEdit({ adminOrigin: 'https://cms.example.com' }); // <h1 data-np-field="title">
 *
 * The editor posts `nodepress:preview` messages with the form's current data
 * (debounced) and listens for `nodepress:ready` / `nodepress:focus-field`.
 * Messages from any origin other than `adminOrigin` are ignored.
 */

export interface PreviewUpdate<TData = Record<string, any>> {
  type: 'nodepress:preview';
  /** Content type name, e.g. "blog". */
  contentType: string;
  /** The slug as currently typed in the editor (may differ from the saved one). */
  slug: string;
  locale: string;
  /** The entry's field values, unsaved edits included. */
  data: TData;
}

/** The bits of `window` the helpers use — pass your own in tests or non-browser hosts. */
export interface PreviewWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: 'message', listener: (event: any) => void): void;
  removeEventListener(type: 'message', listener: (event: any) => void): void;
  document?: {
    addEventListener(type: string, listener: (event: any) => void, capture?: boolean): void;
    removeEventListener(type: string, listener: (event: any) => void, capture?: boolean): void;
  };
}

export interface PreviewOptions {
  /** The NodePress admin's origin, e.g. "https://cms.example.com". Several are allowed; "*" is not. */
  adminOrigin: string | string[];
  /** Default: globalThis.window. */
  window?: PreviewWindow;
}

export interface ClickToEditOptions extends PreviewOptions {
  /** Attribute naming the entry field an element shows. Default: "data-np-field". */
  attribute?: string;
  /** Hover outline. Default: "2px dashed #6366f1". */
  outline?: string;
}

const noop = () => {};

function origins(adminOrigin: string | string[]): string[] {
  const list = (Array.isArray(adminOrigin) ? adminOrigin : [adminOrigin]).filter(Boolean);
  if (!list.length) throw new Error('@nodepress-cms/client/preview: `adminOrigin` is required');
  return list.map((o) => {
    if (o === '*') throw new Error('@nodepress-cms/client/preview: `adminOrigin` must be an origin, not "*"');
    try {
      return new URL(o).origin;
    } catch {
      throw new Error(`@nodepress-cms/client/preview: invalid adminOrigin "${o}"`);
    }
  });
}

function resolveWindow(win?: PreviewWindow): PreviewWindow | undefined {
  return win ?? ((globalThis as any).window as PreviewWindow | undefined);
}

/** True when the page runs inside a frame (e.g. the editor's preview pane). */
export function isInPreviewFrame(win?: PreviewWindow): boolean {
  const w = resolveWindow(win);
  return !!w && !!w.parent && (w.parent as unknown) !== w;
}

function post(win: PreviewWindow, allowed: string[], message: unknown) {
  for (const origin of allowed) {
    try {
      win.parent!.postMessage(message, origin);
    } catch {
      // the parent isn't on this origin — the browser drops it anyway
    }
  }
}

/**
 * Calls `callback` with each `nodepress:preview` message the editor sends,
 * after telling it the page is ready (so it sends the current data at once).
 * Returns an unsubscribe function. Does nothing outside a frame.
 */
export function onPreviewUpdate<TData = Record<string, any>>(
  callback: (update: PreviewUpdate<TData>) => void,
  options: PreviewOptions,
): () => void {
  const allowed = origins(options?.adminOrigin);
  const win = resolveWindow(options.window);
  if (!win || !isInPreviewFrame(win)) return noop;

  const listener = (event: { origin?: string; source?: unknown; data?: any }) => {
    if (!event || !allowed.includes(event.origin as string)) return;
    if (event.source && event.source !== win.parent) return;
    const msg = event.data;
    if (!msg || msg.type !== 'nodepress:preview' || typeof msg.data !== 'object' || msg.data === null) return;
    callback(msg as PreviewUpdate<TData>);
  };
  win.addEventListener('message', listener);
  post(win, allowed, { type: 'nodepress:ready' });
  return () => win.removeEventListener('message', listener);
}

/**
 * Elements with `data-np-field="<field>"` get an outline on hover; a click asks
 * the editor to scroll to and focus that field. Only active inside a frame.
 * Returns a function that turns it off again.
 */
export function enableClickToEdit(options: ClickToEditOptions): () => void {
  const allowed = origins(options?.adminOrigin);
  const win = resolveWindow(options.window);
  const doc = win?.document;
  if (!win || !doc || !isInPreviewFrame(win)) return noop;

  const attribute = options.attribute ?? 'data-np-field';
  const outline = options.outline ?? '2px dashed #6366f1';
  const selector = `[${attribute}]`;
  const saved = new Map<any, { outline: string; cursor: string }>();

  const fieldElement = (target: any): any =>
    target && typeof target.closest === 'function' ? target.closest(selector) : null;

  const over = (event: any) => {
    const el = fieldElement(event.target);
    if (!el || saved.has(el) || !el.style) return;
    saved.set(el, { outline: el.style.outline, cursor: el.style.cursor });
    el.style.outline = outline;
    el.style.cursor = 'pointer';
  };
  const restore = (el: any) => {
    const prev = saved.get(el);
    if (!prev) return;
    el.style.outline = prev.outline;
    el.style.cursor = prev.cursor;
    saved.delete(el);
  };
  const out = (event: any) => {
    const el = fieldElement(event.target);
    // Still inside the same field element (moving between its children).
    if (!el || (event.relatedTarget && fieldElement(event.relatedTarget) === el)) return;
    restore(el);
  };
  const click = (event: any) => {
    const el = fieldElement(event.target);
    if (!el) return;
    const field = el.getAttribute(attribute);
    if (!field) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    post(win, allowed, { type: 'nodepress:focus-field', field });
  };

  doc.addEventListener('mouseover', over, true);
  doc.addEventListener('mouseout', out, true);
  doc.addEventListener('click', click, true);
  return () => {
    doc.removeEventListener('mouseover', over, true);
    doc.removeEventListener('mouseout', out, true);
    doc.removeEventListener('click', click, true);
    for (const el of [...saved.keys()]) restore(el);
  };
}
