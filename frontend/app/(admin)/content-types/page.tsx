'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, LayoutGrid, Download, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Pagination } from '@/components/ui/data-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const FIELD_TYPE_BADGE: Record<string, string> = {
  text:     'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  textarea: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  richtext: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  number:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  boolean:  'bg-green-500/10 text-green-400 border border-green-500/20',
  select:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  image:    'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  repeater: 'bg-red-500/10 text-red-400 border border-red-500/20',
  flexible: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
};

interface SubField { name: string; type: string }
interface Layout   { name: string; label: string; fields: SubField[] }
interface Field {
  name:     string;
  type:     string;
  required: boolean;
  options?: { subFields?: SubField[]; layouts?: Layout[]; choices?: string };
}
interface ContentType { id: number; name: string; schema: Field[]; createdAt: string }

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------
function exportContentType(ct: ContentType) {
  const payload = {
    nodepress: '1.0',
    exportedAt: new Date().toISOString(),
    contentType: { name: ct.name, schema: ct.schema },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ct.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ContentTypesPage() {
  const router = useRouter();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading]           = useState(false);
  const [duplicating, setDuplicating]   = useState<number | null>(null);
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 10;

  // ---- data ----
  const fetchContentTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/content-types');
      setContentTypes(res.data);
    } catch {
      toast.error('Failed to load content types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContentTypes(); }, []);

  useEffect(() => { setPage(1); }, [search]);

  const handleDuplicate = async (ct: ContentType) => {
    setDuplicating(ct.id);
    const candidates = [
      `${ct.name}_copy`,
      ...Array.from({ length: 9 }, (_, i) => `${ct.name}_copy_${i + 2}`),
    ];
    for (const name of candidates) {
      try {
        const res = await api.post('/content-types', { name, schema: ct.schema });
        toast.success(`Duplicated as "${name}"`);
        router.push(`/content-types/${res.data.id}/edit`);
        return;
      } catch (err: any) {
        if (err.response?.status !== 409) {
          toast.error(err.response?.data?.message || 'Duplicate failed');
          setDuplicating(null);
          return;
        }
      }
    }
    toast.error('Could not find a unique name for the duplicate');
    setDuplicating(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/content-types/${id}`);
      toast.success('Deleted');
      fetchContentTypes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const filtered = contentTypes.filter((ct) =>
    ct.name.toLowerCase().includes(search.toLowerCase()),
  );
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 max-w-xs">
          <SearchInput
            placeholder="Search content types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto">
          <Button onClick={() => router.push('/content-types/new')}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Content Type
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead className="w-24">Count</TableHead>
            <TableHead className="w-28">Created</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              </TableRow>
            ))
          )}
          {filtered.length === 0 && !loading && (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                {search ? 'No content types match your search.' : 'No content types yet. Create your first one.'}
              </TableCell>
            </TableRow>
          )}
          {paginated.map((ct) => (
            <TableRow key={ct.id}>
              <TableCell>
                <span className="flex items-center gap-2 font-medium">
                  <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                  {ct.name}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {ct.schema.map((f, i) => (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                        FIELD_TYPE_BADGE[f.type] ?? 'bg-muted text-muted-foreground border border-border',
                      )}
                    >
                      {f.name}
                      <span className="ml-1 opacity-60">({f.type})</span>
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{ct.schema.length}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(ct.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/content-types/${ct.id}/edit`)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Duplicate"
                    disabled={duplicating === ct.id}
                    onClick={() => handleDuplicate(ct)}
                  >
                    {duplicating === ct.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => exportContentType(ct)} title="Export JSON">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete" />}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete content type?</AlertDialogTitle>
                        <AlertDialogDescription>
                          All entries under <strong>{ct.name}</strong> will also be deleted. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(ct.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
