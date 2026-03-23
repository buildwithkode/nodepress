'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

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
  fields: { name: string; label: string; type: string }[];
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
      if (subRes.status === 'fulfilled')  setRows(subRes.value.data);
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
        <div className="ml-auto">
          <SearchInput
            placeholder="Search submissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                  {columns.slice(0, 3).map((col) => (
                    <span key={col} className="text-sm truncate pr-4">
                      {row.data[col] === null || row.data[col] === undefined
                        ? <span className="text-muted-foreground/40">—</span>
                        : typeof row.data[col] === 'boolean'
                          ? <Badge variant={row.data[col] ? 'default' : 'outline'} className="text-xs">{row.data[col] ? 'Yes' : 'No'}</Badge>
                          : String(row.data[col]).length > 50
                            ? String(row.data[col]).slice(0, 50) + '…'
                            : String(row.data[col])}
                    </span>
                  ))}
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
                          <p className="text-sm break-words">
                            {val === null || val === undefined
                              ? <span className="text-muted-foreground/40 italic">empty</span>
                              : typeof val === 'boolean'
                                ? <Badge variant={val ? 'default' : 'outline'} className="text-xs">{val ? 'Yes' : 'No'}</Badge>
                                : String(val)}
                          </p>
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
