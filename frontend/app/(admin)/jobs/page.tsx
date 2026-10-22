'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import api from '@/lib/axios';
import { useTranslations } from 'use-intl';

type Job = {
  id: number;
  type: string;
  payload: unknown;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type Counts = { pending: number; done: number; failed: number };

const STATUS_STYLES: Record<string, string> = {
  done:    'bg-green-500/10 text-green-400 border border-green-500/20',
  failed:  'bg-red-500/10 text-red-400 border border-red-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
};

const TABS = ['failed', 'pending', 'done', 'all'] as const;
const LIMIT = 25;

/** Background jobs (form email/webhook actions, plugin tasks) — inspect and retry failures. */
export default function JobsPage() {
  const t = useTranslations('developer');
  const tc = useTranslations('common');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, done: 0, failed: 0 });
  const [types, setTypes] = useState<string[]>([]);
  const [status, setStatus] = useState<(typeof TABS)[number]>('failed');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/jobs', { params: { status, type: type || undefined, page, limit: LIMIT } });
      setJobs(res.data.data);
      setTotal(res.data.meta.total);
      setCounts(res.data.counts);
      setTypes(res.data.types);
    } catch {
      toast.error(t('jobs.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [status, type, page]);

  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t('jobs.actionFailed'));
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-xl font-semibold">{t('jobs.title')}</h1>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-border hover:bg-muted/40 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {tc('refresh')}
        </button>
        {counts.failed > 0 && (
          <button
            disabled={busy === 'all'}
            onClick={() => act('all', () => api.post('/jobs/retry-failed', null, { params: { type: type || undefined } }), t('jobs.failedRequeued'))}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t('jobs.retryAllFailed')}{type ? ` (${type})` : ''}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        {t.rich('jobs.intro', {
          strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setStatus(tab); setPage(1); }}
            className={`text-sm px-3 py-1.5 rounded border transition-colors ${
              status === tab ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {t(`jobs.tabs.${tab}`)}
            {tab !== 'all' && <span className="ml-1.5 text-xs opacity-70">{counts[tab]}</span>}
          </button>
        ))}
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="ml-auto text-sm bg-background border border-border rounded px-2 py-1.5"
          aria-label={t('jobs.filterByType')}
        >
          <option value="">{t('jobs.allTypes')}</option>
          {types.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">{tc('loading')}</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          {status === 'failed' ? t('jobs.noFailed') : t('jobs.empty')}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('jobs.colJob')}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{tc('status')}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t('jobs.colAttempts')}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">{t('jobs.colNextRun')}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{tc('createdAt')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <Fragment key={j.id}>
                  <tr
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setOpen(open === j.id ? null : j.id)}
                  >
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-pink-400">{j.type}</code>
                      <span className="text-xs text-muted-foreground ml-2">#{j.id}</span>
                      <span className={`sm:hidden ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[j.status] ?? ''}`}>
                        {t(`jobs.status.${j.status}`)}
                      </span>
                      {j.lastError && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px] sm:max-w-[260px]" title={j.lastError}>
                          {j.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[j.status] ?? ''}`}>
                        {t(`jobs.status.${j.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{j.attempts}/{j.maxAttempts}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {j.status === 'pending' ? new Date(j.runAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {j.status !== 'done' && (
                        <button
                          disabled={busy === `r${j.id}`}
                          onClick={() => act(`r${j.id}`, () => api.post(`/jobs/${j.id}/retry`), t('jobs.requeued', { id: j.id }))}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> {tc('retry')}
                        </button>
                      )}
                      {j.status !== 'pending' && (
                        <button
                          disabled={busy === `d${j.id}`}
                          onClick={() => act(`d${j.id}`, () => api.delete(`/jobs/${j.id}`), t('jobs.deleted', { id: j.id }))}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-50 ml-1.5"
                          aria-label={t('jobs.deleteAria', { id: j.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === j.id && (
                    <tr className="bg-muted/10">
                      <td colSpan={6} className="px-4 py-3">
                        {j.lastError && (
                          <p className="text-xs mb-2">
                            <span className="text-muted-foreground">{t('jobs.lastError')} </span>
                            <span className="text-red-400 break-words">{j.lastError}</span>
                          </p>
                        )}
                        <pre className="text-xs font-mono bg-background border border-border rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(j.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted-foreground">{tc('page', { page, total: totalPages })}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/40 transition-colors"
            >
              {tc('previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded border border-border disabled:opacity-40 hover:bg-muted/40 transition-colors"
            >
              {tc('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
