'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Play, XCircle } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ReadOnly } from '@/components/ReadOnly';

type TypeSummary = { postType: string; exists: boolean; total: number; existing: number; byStatus: Record<string, number> };
type DryRun = {
  site: { title: string; link: string; version: string };
  locale: string;
  total: number;
  byType: Record<string, TypeSummary>;
  contentTypesToCreate: string[];
  attachments: number;
  skipped: Record<string, number>;
  sample: { contentType: string; slug: string; title: string; status: string; date: string | null; author: string }[];
  stats: {
    nestedCategories: number;
    taxonomies: Record<string, number>;
    authors: number;
    comments: { approved: number; pending: number; spam: number; trash: number; other: number };
  };
  warnings: string[];
};
type Extras = { categoryPaths: boolean; taxonomies: boolean; authors: boolean; comments: boolean; pendingComments: boolean };
const EXTRAS_OFF: Extras = { categoryPaths: false, taxonomies: false, authors: false, comments: false, pendingComments: false };
type Counts = { created: number; updated: number; skipped: number; failed: number };
type JobStatus = {
  jobId: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: { phase: 'media' | 'entries'; done: number; total: number } | null;
  result: {
    contentTypesCreated: string[];
    byType: Record<string, Counts>;
    media: { imported: number; reused: number; failed: number };
    errors: string[];
    warnings: string[];
  } | null;
  error: string | null;
};

const MAX_BYTES = 50 * 1024 * 1024;

/** The upload goes through fetch: the axios instance defaults to a JSON body. */
async function postExport(file: File, query: string, fallback: { tooLarge: string; failed: (status: number) => string }) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/import/wordpress${query}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Cookies.get('np_token') ?? ''}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(res.status === 413 ? fallback.tooLarge : msg || fallback.failed(res.status));
  }
  return data;
}

/** Import a WordPress export (Tools → Export → All content) — dry run first, then a background job. */
export default function ImportPage() {
  const t = useTranslations('importer');
  const tc = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<DryRun | null>(null);
  const [importMedia, setImportMedia] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  // Optional extras — each changes what the dry run reports, so it is re-run when one is toggled.
  const [extras, setExtras] = useState<Extras>(EXTRAS_OFF);
  const [busy, setBusy] = useState<'analyze' | 'run' | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);

  const fallback = { tooLarge: t('tooLarge'), failed: (status: number) => t('requestFailed', { status }) };
  const active = job && (job.status === 'pending' || job.status === 'running');

  // Poll the job until it finishes.
  useEffect(() => {
    if (!job || !active) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/import/wordpress/${job.jobId}`);
        setJob(res.data);
        if (res.data.status === 'done') toast.success(t('finished'));
        if (res.data.status === 'failed') toast.error(t('failed'));
      } catch {
        setJob({ ...job }); // try again on the next tick
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [job, active]);

  const extrasParams = () => Object.fromEntries(
    Object.entries({ ...extras, pendingComments: extras.comments && extras.pendingComments }).map(([k, v]) => [k, String(v)]),
  );
  const extrasKey = JSON.stringify(extras);
  useEffect(() => {
    if (summary && file) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasKey]);
  const toggle = (key: keyof Extras) => (v: boolean) => setExtras((e) => ({ ...e, [key]: v }));

  const pick = (f: File | null) => {
    setSummary(null);
    setJob(null);
    if (f && f.size > MAX_BYTES) {
      toast.error(t('tooLarge'));
      setFile(null);
      return;
    }
    setFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setBusy('analyze');
    try {
      setSummary(await postExport(file, `?${new URLSearchParams({ dryRun: 'true', ...extrasParams() })}`, fallback));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!file) return;
    setBusy('run');
    try {
      const params = new URLSearchParams({ importMedia: String(importMedia), overwrite: String(overwrite), ...extrasParams() });
      const res = await postExport(file, `?${params}`, fallback);
      setJob({ jobId: res.jobId, status: 'pending', progress: null, result: null, error: null });
      toast.success(t('queued', { id: res.jobId }));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const skippedTotal = summary ? Object.values(summary.skipped).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t.rich('intro', { strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
        </p>
      </div>
      <ReadOnly module="import">

        {/* 1. File */}
        <section className="rounded-xl border border-border p-4 sm:p-5 space-y-3">
          <h2 className="font-medium">{t('step1')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={!!active}>
              <FileUp className="h-4 w-4" /> {file ? t('changeFile') : t('chooseFile')}
            </Button>
            <span className="text-sm text-muted-foreground truncate max-w-full">
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : t('noFile')}
            </span>
            <Button className="sm:ml-auto" onClick={analyze} disabled={!file || busy !== null || !!active}>
              {busy === 'analyze' && <Loader2 className="h-4 w-4 animate-spin" />} {t('analyze')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('fileHint')}</p>
        </section>

        {/* 2. Summary */}
        {summary && (
          <section className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-medium">{t('step2')}</h2>
              <span className="text-sm text-muted-foreground">
                {summary.site.title || summary.site.link} · {t('wxrVersion', { version: summary.site.version })}
              </span>
            </div>
            <p className="text-sm">
              {t('totals', { total: summary.total, attachments: summary.attachments, skipped: skippedTotal })}
            </p>

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colContentType')}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colEntries')}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">{t('colStatuses')}</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colExisting')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(summary.byType).map(([name, s]) => (
                    <tr key={name}>
                      <td className="px-3 py-2">
                        <code className="text-xs font-mono">{name}</code>
                        <Badge variant={s.exists ? 'secondary' : 'outline'} className="ml-2">
                          {s.exists ? t('typeExists') : t('typeNew')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{s.total}</td>
                      <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">
                        {Object.entries(s.byStatus).map(([st, n]) => `${tc(`statuses.${st}`)}: ${n}`).join(' · ')}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{s.existing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {skippedTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('skippedList', { list: Object.entries(summary.skipped).map(([k, n]) => `${k} (${n})`).join(', ') })}
              </p>
            )}

            {summary.warnings.length > 0 && (
              <ul className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1 text-sm">
                {summary.warnings.map((w) => (
                  <li key={w} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" /><span className="break-words">{w}</span></li>
                ))}
              </ul>
            )}

            {summary.sample.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">{t('sample')}</h3>
                <ul className="text-sm divide-y divide-border rounded-lg border border-border">
                  {summary.sample.map((s) => (
                    <li key={`${s.contentType}/${s.slug}`} className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="font-medium break-words">{s.title}</span>
                      <code className="text-xs font-mono text-muted-foreground">{s.contentType}/{s.slug}</code>
                      <span className="text-xs text-muted-foreground">{tc(`statuses.${s.status}`)}</span>
                      {s.author && <span className="text-xs text-muted-foreground">{s.author}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={importMedia} onCheckedChange={(v) => setImportMedia(!!v)} className="mt-0.5" />
                <span>
                  {t('importMedia')}
                  <span className="block text-xs text-muted-foreground">{t('importMediaHint')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} className="mt-0.5" />
                <span>
                  {t('overwrite')}
                  <span className="block text-xs text-muted-foreground">{t('overwriteHint')}</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('extras')}</h3>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={extras.categoryPaths} onCheckedChange={toggle('categoryPaths')} disabled={busy !== null} className="mt-0.5" />
                <span>
                  {t('categoryPaths')}
                  <span className="block text-xs text-muted-foreground">{t('categoryPathsHint', { count: summary.stats.nestedCategories })}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={extras.taxonomies} onCheckedChange={toggle('taxonomies')} disabled={busy !== null} className="mt-0.5" />
                <span>
                  {t('taxonomies')}
                  <span className="block text-xs text-muted-foreground">
                    {t('taxonomiesHint')}{' '}
                    {Object.keys(summary.stats.taxonomies).length
                      ? t('taxonomiesFound', { list: Object.entries(summary.stats.taxonomies).map(([k, n]) => `${k} (${n})`).join(', ') })
                      : t('taxonomiesNone')}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={extras.authors} onCheckedChange={toggle('authors')} disabled={busy !== null} className="mt-0.5" />
                <span>
                  {t('authors')}
                  <span className="block text-xs text-muted-foreground">{t('authorsHint', { count: summary.stats.authors })}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={extras.comments} onCheckedChange={toggle('comments')} disabled={busy !== null} className="mt-0.5" />
                <span>
                  {t('comments')}
                  <span className="block text-xs text-muted-foreground">
                    {t('commentsHint', {
                      approved: summary.stats.comments.approved,
                      pending: summary.stats.comments.pending,
                      spam: summary.stats.comments.spam + summary.stats.comments.trash,
                    })}
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-2 text-sm pl-6 ${extras.comments ? 'cursor-pointer' : 'opacity-50'}`}>
                <Checkbox
                  checked={extras.comments && extras.pendingComments}
                  onCheckedChange={toggle('pendingComments')}
                  disabled={!extras.comments || busy !== null}
                  className="mt-0.5"
                />
                <span>
                  {t('pendingComments')}
                  <span className="block text-xs text-muted-foreground">{t('pendingCommentsHint')}</span>
                </span>
              </label>
            </div>

            <Button onClick={run} disabled={busy !== null || !!active || summary.total === 0}>
              {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t('run', { total: summary.total })}
            </Button>
          </section>
        )}

        {/* 3. Progress + result */}
        {job && (
          <section className="rounded-xl border border-border p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{t('step3', { id: job.jobId })}</h2>
              {active && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {job.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {job.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
              <span className="text-sm text-muted-foreground">{t(`status.${job.status}`)}</span>
            </div>

            {job.progress && active && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {t(`phase.${job.progress.phase}`, { done: job.progress.done, total: job.progress.total })}
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${job.progress.total ? (job.progress.done / job.progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {job.error && <p className="text-sm text-destructive break-words">{job.error}</p>}

            {job.result && (
              <>
                {job.result.contentTypesCreated.length > 0 && (
                  <p className="text-sm">{t('typesCreated', { list: job.result.contentTypesCreated.join(', ') })}</p>
                )}
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colContentType')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colCreated')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colUpdated')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colSkipped')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('colFailed')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Object.entries(job.result.byType).map(([name, c]) => (
                        <tr key={name}>
                          <td className="px-3 py-2"><code className="text-xs font-mono">{name}</code></td>
                          <td className="px-3 py-2">{c.created}</td>
                          <td className="px-3 py-2">{c.updated}</td>
                          <td className="px-3 py-2">{c.skipped}</td>
                          <td className={`px-3 py-2 ${c.failed ? 'text-destructive' : ''}`}>{c.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(job.result.media.imported + job.result.media.reused + job.result.media.failed) > 0 && (
                  <p className="text-sm">{t('mediaResult', job.result.media)}</p>
                )}
                {job.result.errors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-1">{t('errors', { count: job.result.errors.length })}</h3>
                    <ul className="text-xs font-mono rounded-lg border border-border bg-muted/20 p-3 max-h-64 overflow-auto space-y-1">
                      {job.result.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}
                    </ul>
                  </div>
                )}
                <Link href="/entries" className="text-sm text-primary hover:underline">{t('viewEntries')}</Link>
              </>
            )}
          </section>
        )}
      </ReadOnly>
    </div>
  );
}
