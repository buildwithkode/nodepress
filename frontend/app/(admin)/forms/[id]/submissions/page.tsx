'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronRight, Inbox, Download } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { summarize, toCsv, downloadCsv, CsvField } from '../../_components/submission-format';

interface Submission {
  id: number;
  data: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

interface FormMeta {
  id: number;
  name: string;
  slug: string;
  fields: CsvField[];
}

/** Render a submission value that may be nested (object / array / array-of-objects). */
function SubmissionValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/40 italic">empty</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'outline'} className="text-xs">{value ? 'Yes' : 'No'}</Badge>;
  }
  if (Array.isArray(value)) {
    const allScalar = value.every((x) => x === null || typeof x !== 'object');
    if (allScalar) {
      return (
        <span className="flex flex-wrap gap-1">
          {value.map((x, i) => <Badge key={i} variant="secondary" className="text-xs font-normal">{String(x)}</Badge>)}
        </span>
      );
    }
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="rounded border bg-background/60 p-2">
            <p className="text-[10px] text-muted-foreground mb-1">#{i + 1}</p>
            <SubmissionValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="space-y-1 pl-2 border-l-2 border-border/60">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="text-sm">
            <span className="text-xs text-muted-foreground">{k}: </span>
            <SubmissionValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-sm break-words">{String(value)}</span>;
}

const PAGE_SIZE = 15;

export default function SubmissionsPage() {
  const params    = useParams();
  const id        = params?.id as string;
  const router    = useRouter();
  const [form,    setForm]    = useState<FormMeta | null>(null);
  const [rows,    setRows]    = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    Promise.allSettled([
      api.get(`/forms/${id}`),
      api.get(`/forms/${id}/submissions`),
    ]).then(([formRes, subRes]) => {
      if (formRes.status === 'fulfilled') setForm(formRes.value.data);
      if (subRes.status === 'fulfilled')  setRows(subRes.value.data.data);
      else toast.error('Failed to load submissions');
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = rows.filter((r) => {
    const values = Object.values(r.data).join(' ').toLowerCase();
    return values.includes(search.toLowerCase());
  });
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Column headers: use form fields if available, else derive from first row
  const columns: string[] = form?.fields.map((f) => f.name) ??
    (rows[0] ? Object.keys(rows[0].data) : []);

  const labelFor = (key: string) => {
    const f = form?.fields.find((f) => f.name === key);
    return f?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('No submissions to export'); return; }
    const csv = toCsv(form?.fields, filtered);
    downloadCsv(`${form?.slug ?? 'submissions'}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push('/forms')}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Forms
        </Button>
        {form && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium">{form.name}</span>
            <Badge variant="secondary" className="font-mono text-xs">{form.slug}</Badge>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SearchInput
            placeholder="Search submissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={loading || rows.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      {/* Empty / loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center py-24 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No submissions yet</p>
          <p className="text-xs mt-1">Share the form and responses will appear here.</p>
        </div>
      )}

      {/* Table */}
      {!loading && paginated.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          {/* Header row */}
          <div className="grid bg-muted/50 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2"
            style={{ gridTemplateColumns: `1fr repeat(${Math.min(columns.length, 3)}, 1fr) 120px 32px` }}
          >
            {columns.slice(0, 3).map((col) => (
              <span key={col}>{labelFor(col)}</span>
            ))}
            <span>Date</span>
            <span />
          </div>

          {/* Data rows */}
          {paginated.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <div key={row.id} className="border-b last:border-0">
                {/* Summary row */}
                <div
                  className="grid items-center px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                  style={{ gridTemplateColumns: `1fr repeat(${Math.min(columns.length, 3)}, 1fr) 120px 32px` }}
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                >
                  {columns.slice(0, 3).map((col) => {
                    const v = row.data[col];
                    const text = summarize(v);
                    return (
                      <span key={col} className="text-sm truncate pr-4">
                        {v === null || v === undefined || text === ''
                          ? <span className="text-muted-foreground/40">—</span>
                          : typeof v === 'boolean'
                            ? <Badge variant={v ? 'default' : 'outline'} className="text-xs">{v ? 'Yes' : 'No'}</Badge>
                            : text.length > 50 ? text.slice(0, 50) + '…' : text}
                      </span>
                    );
                  })}
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 bg-muted/10 border-t">
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(row.data).map(([key, val]) => (
                        <div key={key} className="space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {labelFor(key)}
                          </p>
                          <div className="text-sm break-words">
                            <SubmissionValue value={val} />
                          </div>
                        </div>
                      ))}
                      {row.ip && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">IP</p>
                          <p className="text-sm font-mono text-muted-foreground">{row.ip}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
