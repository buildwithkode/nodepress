'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Inbox, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { canDeleteContent } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/data-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useTranslations } from 'use-intl';

interface FormRow {
  id: number;
  name: string;
  slug: string;
  fields: unknown[];
  isActive: boolean;
  createdAt: string;
  _count: { submissions: number };
}

const PAGE_SIZE = 10;

export default function FormsPage() {
  const t = useTranslations('forms');
  const tc = useTranslations('common');
  const router = useRouter();
  const { user } = useAuth();
  const canEdit = canDeleteContent(user?.role);
  const [forms, setForms]   = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/forms');
      setForms(res.data.data);
    } catch {
      toast.error(t('list.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/forms/${id}`);
      toast.success(t('list.deleted'));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('list.deleteFailed'));
    }
  };

  const toggleActive = async (form: FormRow) => {
    try {
      await api.put(`/forms/${form.id}`, { isActive: !form.isActive });
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, isActive: !f.isActive } : f));
    } catch {
      toast.error(t('list.statusFailed'));
    }
  };

  const filtered  = forms.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.slug.toLowerCase().includes(search.toLowerCase()),
  );
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 max-w-xs">
          <SearchInput
            placeholder={t('list.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <div className="ml-auto">
            <Button onClick={() => router.push('/forms/new')}>
              <Plus className="h-4 w-4 mr-1.5" /> {t('list.newForm')}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tc('name')}</TableHead>
            <TableHead>{t('list.columns.slug')}</TableHead>
            <TableHead className="w-20 text-center">{t('list.columns.fields')}</TableHead>
            <TableHead className="w-24 text-center">{t('list.columns.submissions')}</TableHead>
            <TableHead className="w-20 text-center">{tc('status')}</TableHead>
            <TableHead className="w-36 text-right">{tc('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : paginated.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                {search
                  ? t('list.noMatches')
                  : t('list.empty')}
              </TableCell>
            </TableRow>
          ) : paginated.map((form) => (
            <TableRow key={form.id}>
              <TableCell className="font-medium">{form.name}</TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                  {form.slug}
                </code>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{form.fields.length}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <button
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => router.push(`/forms/${form.id}/submissions`)}
                >
                  {form._count.submissions}
                </button>
              </TableCell>
              <TableCell className="text-center">
                {canEdit ? (
                  <button onClick={() => toggleActive(form)} title={t('list.toggleActive')}>
                    {form.isActive
                      ? <ToggleRight className="h-5 w-5 text-emerald-400 mx-auto" />
                      : <ToggleLeft  className="h-5 w-5 text-muted-foreground mx-auto" />}
                  </button>
                ) : (
                  form.isActive
                    ? <ToggleRight className="h-5 w-5 text-emerald-400 mx-auto opacity-50" />
                    : <ToggleLeft  className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {/* Submissions */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={t('list.viewSubmissions')}
                    onClick={() => router.push(`/forms/${form.id}/submissions`)}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                  </Button>

                  {/* Edit */}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={tc('edit')}
                      onClick={() => router.push(`/forms/${form.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Delete */}
                  {canEdit && (
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={tc('delete')}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        />
                      }>
                        <Trash2 className="h-3.5 w-3.5" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('list.deleteConfirmTitle', { name: form.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t.rich('list.deleteConfirmDescription', {
                              count: form._count.submissions,
                              strong: (chunks) => <strong>{chunks}</strong>,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(form.id)}>
                            {tc('delete')}
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

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
