'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Clock, Eye, Link2Off, Loader2 } from 'lucide-react';
import { useBrand } from '@/context/BrandContext';
import { fillPreviewUrl } from '@/components/LivePreviewPane';
import { cn } from '@/lib/utils';

interface Field { name: string; label?: string; type: string; options?: any; fields?: Field[]; layouts?: Array<{ name: string; label?: string; fields?: Field[] }> }
interface Shared {
  expiresAt: string;
  entry: { id: string; slug: string; locale: string; status: string; data: Record<string, any>; updatedAt: string };
  contentType: { name: string; displayName?: string | null; schema: Field[]; previewUrl: string | null };
  previewToken: string | null;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const humanize = (name: string) => name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const subFields = (f: Field): Field[] => f.fields ?? f.options?.fields ?? f.options?.subFields ?? [];
const layoutsOf = (f: Field) => f.layouts ?? f.options?.layouts ?? [];
const imageUrl = (v: any): string | null => (typeof v === 'string' ? v : isObj(v) && typeof v.url === 'string' ? v.url : null);

/** One field's value, readable by someone who has never seen the admin. */
function Value({ field, value }: { field: Field; value: any }) {
  const t = useTranslations('entries');
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <p className="text-sm italic text-muted-foreground">{t('sharePage.empty')}</p>;
  }
  switch (field.type) {
    case 'richtext':
      // Rich text is sanitized when it is saved, as on the public site
      return <div className="space-y-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/50 [&_pre]:p-3 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: String(value) }} />;
    case 'image': {
      const url = imageUrl(value);
      return url ? <img src={url} alt={isObj(value) ? value.alt ?? '' : ''} className="max-h-96 rounded-lg border border-border/60" /> : null;
    }
    case 'boolean':
      return <p className="text-sm">{value ? t('sharePage.yes') : t('sharePage.no')}</p>;
    case 'color':
      return (
        <p className="flex items-center gap-2 text-sm">
          <span className="h-4 w-4 rounded border border-border" style={{ background: String(value) }} />
          {String(value)}
        </p>
      );
    case 'date':
    case 'datetime': {
      const d = new Date(value);
      return <p className="text-sm">{Number.isNaN(d.getTime()) ? String(value) : field.type === 'date' ? d.toLocaleDateString() : d.toLocaleString()}</p>;
    }
    case 'relation':
      return <p className="text-sm text-muted-foreground">{t('sharePage.linked', { count: Array.isArray(value) ? value.length : 1 })}</p>;
    case 'group':
      return isObj(value) ? <Fields schema={subFields(field)} data={value} nested /> : null;
    case 'repeater':
      return Array.isArray(value) ? (
        <ol className="space-y-3">
          {value.map((row, i) => (
            <li key={row?._id ?? i} className="rounded-lg border border-border/60 p-3">
              <Fields schema={subFields(field)} data={isObj(row) ? row : {}} nested />
            </li>
          ))}
        </ol>
      ) : null;
    case 'flexible':
      return Array.isArray(value) ? (
        <ol className="space-y-3">
          {value.map((section, i) => {
            const layout = layoutsOf(field).find((l) => l.name === section?._layout);
            return (
              <li key={section?._id ?? i} className="rounded-lg border border-border/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{layout?.label || humanize(section?._layout ?? '')}</p>
                <Fields schema={layout?.fields ?? []} data={isObj(section) ? section : {}} nested />
              </li>
            );
          })}
        </ol>
      ) : null;
    case 'json':
      return <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
    default:
      if (Array.isArray(value)) return <p className="text-sm">{value.map(String).join(', ')}</p>;
      if (isObj(value)) return <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
      return <p className={cn('text-sm', field.type === 'textarea' && 'whitespace-pre-wrap')}>{String(value)}</p>;
  }
}

function Fields({ schema, data, nested = false }: { schema: Field[]; data: Record<string, any>; nested?: boolean }) {
  return (
    <dl className={cn(nested ? 'space-y-3' : 'space-y-6')}>
      {schema.filter((f) => f?.name).map((f) => (
        <div key={f.name}>
          <dt className={cn('mb-1 font-medium text-muted-foreground', nested ? 'text-xs' : 'text-xs uppercase tracking-wider')}>{f.label || humanize(f.name)}</dt>
          <dd><Value field={f} value={data[f.name]} /></dd>
        </div>
      ))}
    </dl>
  );
}

/** The site's own page in a frame, fed the entry like the editor's live preview. */
function SitePreview({ shared }: { shared: Shared }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const target = useMemo(
    () => fillPreviewUrl(shared.contentType.previewUrl!, { slug: shared.entry.slug, locale: shared.entry.locale, token: shared.previewToken ?? undefined }),
    [shared],
  );
  const send = useCallback(() => {
    if (!target) return;
    frame.current?.contentWindow?.postMessage(
      { type: 'nodepress:preview', contentType: shared.contentType.name, slug: shared.entry.slug, locale: shared.entry.locale, data: shared.entry.data },
      target.origin,
    );
  }, [target, shared]);
  useEffect(() => {
    if (!target) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === target.origin && e.source === frame.current?.contentWindow && e.data?.type === 'nodepress:ready') send();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [target, send]);
  if (!target) return null;
  return (
    <iframe
      ref={frame}
      src={target.url}
      onLoad={send}
      title={shared.entry.slug}
      referrerPolicy="no-referrer"
      className="h-[calc(100vh-3.5rem)] w-full border-0 bg-white"
    />
  );
}

/**
 * Public page of a share link (`/share/<token>`): shows one entry, published or
 * not, to someone without an admin login. Uses the site's own page when the
 * content type has a live preview URL, else a plain read-only view of its fields.
 */
export default function SharePage() {
  const t = useTranslations('entries');
  const { token } = useParams<{ token: string }>();
  const { brand: { brandName } } = useBrand();
  const [shared, setShared] = useState<Shared | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>('loading');
  const [view, setView] = useState<'site' | 'fields'>('site');

  useEffect(() => {
    fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Shared) => { setShared(data); setState('ok'); })
      .catch(() => setState('gone'));
  }, [token]);

  if (state === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (state === 'gone' || !shared) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <Link2Off className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t('sharePage.goneTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('sharePage.goneText')}</p>
        </div>
      </div>
    );
  }

  const { entry, contentType } = shared;
  const hasSite = !!contentType.previewUrl && !!fillPreviewUrl(contentType.previewUrl, { slug: entry.slug, locale: entry.locale, token: shared.previewToken ?? undefined });
  const live = entry.status === 'published';
  const typeName = contentType.displayName || humanize(contentType.name);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/80 bg-background/95 px-4 py-2 backdrop-blur">
        <span className="font-semibold">{brandName}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Eye className="h-3 w-3" aria-hidden="true" />
          {t('sharePage.preview')}
        </span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {typeName} › {entry.slug} ({entry.locale.toUpperCase()})
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', live ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
          {live ? t('sharePage.live') : t('sharePage.notLive')}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {hasSite && (
            <span role="radiogroup" aria-label={t('sharePage.viewLabel')} className="inline-flex rounded-md border border-border/80 bg-muted/40 p-0.5 text-xs">
              {(['site', 'fields'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn('rounded px-2.5 py-1 font-medium', view === v ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {v === 'site' ? t('sharePage.asPage') : t('sharePage.asFields')}
                </button>
              ))}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {t('sharePage.expires', { date: new Date(shared.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) })}
          </span>
        </span>
      </header>

      {hasSite && view === 'site' ? (
        <SitePreview shared={shared} />
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="mb-6 text-xs text-muted-foreground">
            {t('sharePage.updated', { date: new Date(entry.updatedAt).toLocaleString() })}
          </p>
          <Fields schema={contentType.schema} data={entry.data} />
        </main>
      )}
    </div>
  );
}
