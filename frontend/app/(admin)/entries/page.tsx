'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, ArrowRight, Pencil, Trash2, ArrowLeft, Layers, Copy, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/data-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import {
  Card, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canManageContent } from '@/lib/roles';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function truncate(val: any, max = 60): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) return `${val.length} item${val.length !== 1 ? 's' : ''}`;
  if (typeof val === 'object') {
    const str = Object.entries(val)
      .filter(([k]) => k !== '_layout')
      .map(([, v]) => String(v))
      .join(', ');
    return str.length > max ? str.slice(0, max) + '…' : str;
  }
  const str = String(val);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  published: { label: 'Published', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  draft:     { label: 'Draft',     className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  archived:  { label: 'Archived',  className: 'bg-muted text-muted-foreground' },
};

interface Field { name: string; type: string; options?: any }
interface ContentType { id: number; name: string; schema: Field[] }
interface Entry {
  id: number; slug: string; status: string; contentTypeId: number;
  data: Record<string, any>; createdAt: string; updatedAt: string;
}

export default function EntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canEdit = canManageContent(user?.role);
  const ctParam = searchParams?.get('ct') ?? '';

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<number, number>>({});
  const [loadingCTs, setLoadingCTs] = useState(true);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const selectedCT = contentTypes.find((ct) => ct.name === ctParam) ?? null;

  /* ── Load content types + counts ───────────────────────────────────────── */
  useEffect(() => {
    setLoadingCTs(true);
    api.get('/content-types')
      .then(async (res) => {
        const cts: ContentType[] = res.data;
        setContentTypes(cts);
        const counts = await Promise.all(
          cts.map((ct) =>
            api.get('/entries', { params: { contentTypeId: ct.id, limit: 1 } })
              .then((r) => ({ id: ct.id, count: r.data.meta?.total ?? 0 }))
              .catch(() => ({ id: ct.id, count: 0 })),
          ),
        );
        setEntryCounts(Object.fromEntries(counts.map((c) => [c.id, c.count])));
      })
      .catch(() => toast.error('Failed to load content types'))
      .finally(() => setLoadingCTs(false));
  }, []);

  /* ── Load entries when CT is selected ──────────────────────────────────── */
  useEffect(() => {
    if (!selectedCT) { setEntries([]); return; }
    setLoadingEntries(true);
    api.get('/entries', { params: { contentTypeId: selectedCT.id, limit: 100 } })
      .then((res) => setEntries(res.data.data ?? res.data))
      .catch(() => toast.error('Failed to load entries'))
      .finally(() => setLoadingEntries(false));
  }, [selectedCT?.id]);

  useEffect(() => { setPage(1); }, [search, ctParam]);

  /* ── Delete ────────────────────────────────────────────────────────────── */
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/entries/${id}`);
      toast.success('Entry deleted');
      if (selectedCT) {
        const res = await api.get('/entries', { params: { contentTypeId: selectedCT.id, limit: 100 } });
        const list = res.data.data ?? res.data;
        setEntries(list);
        setEntryCounts((prev) => ({ ...prev, [selectedCT.id]: res.data.meta?.total ?? list.length }));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  /* ── Duplicate ──────────────────────────────────────────────────────────── */
  const handleDuplicate = async (entry: Entry) => {
    setDuplicating(entry.id);
    const candidates = [
      `${entry.slug}-copy`,
      ...Array.from({ length: 9 }, (_, i) => `${entry.slug}-copy-${i + 2}`),
    ];
    for (const slug of candidates) {
      try {
        const res = await api.post('/entries', {
          slug,
          data: entry.data,
          contentTypeId: entry.contentTypeId,
        });
        toast.success(`Duplicated as "${slug}"`);
        router.push(`/entries/${res.data.id}/edit`);
        return;
      } catch (err: any) {
        if (err.response?.status !== 409) {
          toast.error(err.response?.data?.message || 'Duplicate failed');
          setDuplicating(null);
          return;
        }
      }
    }
    toast.error('Could not find a unique slug for the duplicate');
    setDuplicating(null);
  };

  /* ── Cards view ─────────────────────────────────────────────────────────── */
  if (!ctParam) {
    if (loadingCTs) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardFooter className="gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-28" />
              </CardFooter>
            </Card>
          ))}
        </div>
      );
    }

    if (contentTypes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No content types yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create a content type first to start adding entries.
          </p>
          <Button className="mt-4" size="sm" onClick={() => router.push('/content-types/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Content Type
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {contentTypes.map((ct) => {
          const count = entryCounts[ct.id];
          const fields = ct.schema.slice(0, 3).map((f) => f.name);
          return (
            <Card key={ct.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base capitalize">
                    {ct.name.replace(/_/g, ' ')}
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {count === undefined ? '…' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
                  </Badge>
                </div>
                <CardDescription className="text-xs truncate">
                  {fields.length > 0
                    ? fields.join(', ') + (ct.schema.length > 3 ? ` +${ct.schema.length - 3} more` : '')
                    : 'No fields defined'}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto gap-2">
                {canEdit && (
                  <Button onClick={() => router.push(`/entries/new?ct=${ct.id}`)}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Entry
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push(`/entries?ct=${ct.name}`)}
                >
                  View Entries <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  }

  /* ── Entries table view ─────────────────────────────────────────────────── */
  const schemaColumns = selectedCT?.schema.slice(0, 3) ?? [];
  const filteredEntries = entries.filter((e) =>
    e.slug.toLowerCase().includes(search.toLowerCase()),
  );
  const paginatedEntries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push('/entries')}
        >
          <ArrowLeft className="h-4 w-4" /> All Types
        </Button>
        <span className="text-muted-foreground/40 text-sm">/</span>
        <span className="text-sm font-medium capitalize">{ctParam.replace(/_/g, ' ')}</span>
        <div className="ml-auto flex items-center gap-2">
          <SearchInput
            placeholder="Search entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canEdit && (
            <Button onClick={() => router.push(`/entries/new?ct=${selectedCT?.id ?? ''}`)}>
              <Plus className="h-4 w-4 mr-1.5" /> New Entry
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            {schemaColumns.map((col) => (
              <TableHead key={col.name}>
                {col.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </TableHead>
            ))}
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loadingEntries && Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              {schemaColumns.map((col) => (
                <TableCell key={col.name}><Skeleton className="h-4 w-24" /></TableCell>
              ))}
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            </TableRow>
          ))}
          {!loadingEntries && paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={schemaColumns.length + 3}
                className="py-12 text-center text-muted-foreground"
              >
                {search ? 'No entries match your search.' : 'No entries yet. Create the first one.'}
              </TableCell>
            </TableRow>
          )}
          {paginatedEntries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <p className="font-medium text-foreground">{entry.slug}</p>
              </TableCell>
              <TableCell>
                {(() => {
                  const s = STATUS_LABELS[entry.status] ?? STATUS_LABELS.published;
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                      {s.label}
                    </span>
                  );
                })()}
              </TableCell>
              {schemaColumns.map((col) => {
                const val = entry.data[col.name];
                return (
                  <TableCell key={col.name} className="text-muted-foreground">
                    {val === undefined || val === null ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : col.type === 'boolean' ? (
                      <Badge variant={val ? 'default' : 'outline'} className="text-xs">
                        {val ? 'Yes' : 'No'}
                      </Badge>
                    ) : col.type === 'image' && val ? (
                      <img src={val} alt="" className="h-9 w-12 rounded object-cover" />
                    ) : col.type === 'repeater' || col.type === 'flexible' ? (
                      <Badge variant="secondary" className="text-xs">
                        {Array.isArray(val) ? `${val.length} item${val.length !== 1 ? 's' : ''}` : '—'}
                      </Badge>
                    ) : col.type === 'richtext' ? (
                      <span className="text-muted-foreground/60 text-xs italic">Rich text</span>
                    ) : (
                      truncate(val)
                    )}
                  </TableCell>
                );
              })}
              <TableCell className="text-muted-foreground">{formatDate(entry.updatedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit"
                      onClick={() => router.push(`/entries/${entry.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Duplicate"
                      disabled={duplicating === entry.id}
                      onClick={() => handleDuplicate(entry)}
                    >
                      {duplicating === entry.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  {canEdit && (
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        />
                      }>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <strong>{entry.slug}</strong> will be moved to trash. You can restore it from the API or permanently delete it later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(entry.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination
        total={filteredEntries.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />
    </div>
  );
}
