'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ExternalLink, Loader2, Monitor, MonitorPlay, RotateCw, Smartphone, Tablet, X } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The entry editor's live preview: an iframe of the content type's preview URL
 * ({slug}, {locale}, {token} filled in). Form changes are posted to the frame
 * as `nodepress:preview` messages (debounced), and the frame may post back
 * `nodepress:ready` (send the data now) and `nodepress:focus-field`. Messages
 * only go to, and are only accepted from, the preview URL's origin.
 * Sites use `@nodepress-cms/client/preview` (onPreviewUpdate, enableClickToEdit).
 */

const DEVICES = {
  mobile: { width: 375, icon: Smartphone },
  tablet: { width: 768, icon: Tablet },
  desktop: { width: null, icon: Monitor },
} as const;
type Device = keyof typeof DEVICES;

/** Refresh the preview token this long before it expires. */
const REFRESH_BEFORE_MS = 5 * 60_000;

/** Fill a preview URL template. Returns null unless it is an http(s) URL. */
export function fillPreviewUrl(template: string, values: { slug: string; locale: string; token?: string }) {
  const filled = template.replace(/\{(slug|locale|token)\}/g, (_, key: 'slug' | 'locale' | 'token') =>
    encodeURIComponent(values[key] ?? ''),
  );
  try {
    const url = new URL(filled);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { url: url.toString(), origin: url.origin };
  } catch {
    return null;
  }
}

/**
 * Scroll to and focus a field of the entry form. Fields are found by their
 * `data-np-field` wrapper (or input id); "blocks.0.heading" falls back to "blocks".
 */
export function focusEntryField(root: HTMLElement | null, field: string): boolean {
  if (!root || typeof field !== 'string' || !field || field.length > 200) return false;
  const parts = field.split('.');
  let el: HTMLElement | null = null;
  for (let n = parts.length; n > 0 && !el; n--) {
    const name = CSS.escape(parts.slice(0, n).join('.'));
    el = root.querySelector<HTMLElement>(`[data-np-field="${name}"]`) ?? root.querySelector<HTMLElement>(`#${name}`);
  }
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const target = el.matches('input, textarea, select, [contenteditable="true"]')
    ? el
    : el.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
  target?.focus({ preventScroll: true });
  el.animate?.(
    [{ boxShadow: '0 0 0 2px hsl(var(--ring))', borderRadius: '6px' }, { boxShadow: '0 0 0 2px transparent', borderRadius: '6px' }],
    { duration: 1400, easing: 'ease-out' },
  );
  return true;
}

interface Props {
  /** The content type's previewUrl template. */
  template: string;
  contentType: string;
  /** The saved entry — needed for a preview token. */
  entryId?: number | null;
  /** The saved slug (fills {slug}; the preview endpoint checks it). */
  slug: string;
  /** The slug as currently typed (sent in messages). */
  liveSlug: string;
  locale: string;
  /** Current form values. */
  data: Record<string, any>;
  onFocusField: (field: string) => void;
  onClose: () => void;
}

export function LivePreviewPane({ template, contentType, entryId, slug, liveSlug, locale, data, onFocusField, onClose }: Props) {
  const tp = useTranslations('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const needsToken = template.includes('{token}');
  const [token, setToken] = useState<{ value: string; expiresAt: number } | null>(null);
  const [tokenError, setTokenError] = useState(false);

  // ── Preview token (refreshed before it expires) ───────────────────────────
  const fetchToken = useCallback(async () => {
    if (!needsToken || !entryId) return;
    setTokenError(false);
    try {
      const res = await api.post(`/entries/${entryId}/preview-url`);
      setToken({ value: res.data.token, expiresAt: new Date(res.data.expiresAt).getTime() });
    } catch {
      setTokenError(true);
    }
  }, [needsToken, entryId]);

  useEffect(() => { void fetchToken(); }, [fetchToken]);

  useEffect(() => {
    if (!token) return;
    const delay = Math.max(token.expiresAt - Date.now() - REFRESH_BEFORE_MS, 30_000);
    const timer = setTimeout(() => { void fetchToken(); }, delay);
    return () => clearTimeout(timer);
  }, [token, fetchToken]);

  const target = useMemo(
    () => fillPreviewUrl(template, { slug, locale, token: token?.value }),
    [template, slug, locale, token?.value],
  );
  const waitingForToken = needsToken && !!entryId && !token && !tokenError;

  // ── Messages to the frame ─────────────────────────────────────────────────
  const message = useMemo(
    () => ({ type: 'nodepress:preview', contentType, slug: liveSlug, locale, data }),
    // `data` is a fresh object on every render — compare by content.
    [contentType, liveSlug, locale, JSON.stringify(data)],
  );
  const latest = useRef(message);
  latest.current = message;

  const send = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !target) return;
    try {
      win.postMessage(latest.current, target.origin);
    } catch {
      // not serializable or the frame is gone — the next change retries
    }
  }, [target]);

  useEffect(() => {
    const timer = setTimeout(send, 300);
    return () => clearTimeout(timer);
  }, [message, send]);

  // ── Messages from the frame ───────────────────────────────────────────────
  useEffect(() => {
    if (!target) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== target.origin || event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'nodepress:ready') send();
      else if (msg.type === 'nodepress:focus-field' && typeof msg.field === 'string') onFocusField(msg.field);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [target, send, onFocusField]);

  const width = DEVICES[device].width;

  return (
    <div className="sticky top-4 px-4 py-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorPlay className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{tp('pane.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="inline-flex items-center rounded-md border border-border/80 p-0.5 bg-muted/40">
            {(Object.keys(DEVICES) as Device[]).map((d) => {
              const Icon = DEVICES[d].icon;
              return (
                <Button
                  key={d}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('h-6 w-6', device === d ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground')}
                  onClick={() => setDevice(d)}
                  title={tp(`pane.device.${d}`)}
                  aria-label={tp(`pane.device.${d}`)}
                  aria-pressed={device === d}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={!target}
            title={tp('pane.reload')}
            aria-label={tp('pane.reload')}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => target && window.open(target.url, '_blank', 'noopener,noreferrer')}
            disabled={!target || waitingForToken}
            title={tp('pane.openInNewTab')}
            aria-label={tp('pane.openInNewTab')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title={tp('pane.close')}
            aria-label={tp('pane.close')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/20 overflow-auto h-[calc(100vh-11rem)] min-h-[420px]">
        {!target ? (
          <p className="p-6 text-center text-xs text-muted-foreground">{tp('pane.invalidUrl')}</p>
        ) : needsToken && !entryId ? (
          <p className="p-6 text-center text-xs text-muted-foreground">{tp('pane.saveFirst')}</p>
        ) : tokenError ? (
          <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
            <p>{tp('pane.tokenFailed')}</p>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void fetchToken()}>
              {tp('pane.retry')}
            </Button>
          </div>
        ) : waitingForToken ? (
          <div className="h-full flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tp('pane.preparing')}
          </div>
        ) : (
          <iframe
            key={`${target.url}#${reloadKey}`}
            ref={iframeRef}
            src={target.url}
            title={tp('pane.frameTitle', { slug: liveSlug || slug })}
            onLoad={send}
            // No allow-top-navigation: the site can't navigate the admin away.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="block h-full bg-white mx-auto transition-[width] duration-200"
            style={{ width: width ? `${width}px` : '100%', maxWidth: width ? 'none' : '100%' }}
          />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{tp('pane.hint')}</p>
    </div>
  );
}

/** True for an empty value or an http(s) URL template (the backend checks the same). */
export function isPreviewUrlTemplate(value: string) {
  const v = value.trim();
  if (!v) return true;
  if (/^https?:\/\/[^/?#]*\{/i.test(v)) return false; // no placeholders in the host
  return fillPreviewUrl(v, { slug: 'x', locale: 'x', token: 'x' }) !== null;
}

/** The "Preview URL" input of the content type settings. */
export function PreviewUrlSetting({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tp = useTranslations('preview');
  const invalid = !isPreviewUrlTemplate(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="preview-url">{tp('settings.label')}</Label>
      <Input
        id="preview-url"
        type="url"
        inputMode="url"
        maxLength={2048}
        placeholder="https://site.example/api/draft?token={token}&slug={slug}"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className={cn('font-mono text-xs', invalid && 'border-destructive focus-visible:ring-destructive')}
      />
      {invalid ? (
        <p className="text-xs text-destructive">{tp('settings.invalid')}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {tp('settings.hint')}{' '}
          {['{slug}', '{locale}', '{token}'].map((p) => (
            <code key={p} className="mr-1 rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{p}</code>
          ))}
        </p>
      )}
    </div>
  );
}
