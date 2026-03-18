'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';

import api from '@/lib/axios';
import DynamicFormField from './DynamicFormField';

/* ─── helpers ────────────────────────────────────────────────────────────── */

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function truncate(val: any, max = 60): string {
  const str = String(val);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/* ─── types ─────────────────────────────────────────────────────────────── */

interface Field {
  name: string;
  type: string;
  options?: any;
}

interface ContentType {
  id: number;
  name: string;
  schema: Field[];
}

interface Entry {
  id: number;
  slug: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/* ─── component ─────────────────────────────────────────────────────────── */

export default function EntriesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedCT, setSelectedCT] = useState<ContentType | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingCT, setLoadingCT] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slugManualRef = useRef(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Record<string, any>>();

  /* ── Load content types ─────────────────────────────────────────────── */
  useEffect(() => {
    const fetchContentTypes = async () => {
      setLoadingCT(true);
      try {
        const res = await api.get('/content-types');
        setContentTypes(res.data);
      } catch {
        toast.error('Failed to load content types');
      } finally {
        setLoadingCT(false);
      }
    };
    fetchContentTypes();
  }, []);

  /* ── Slug auto-generation ───────────────────────────────────────────── */
  const firstTextField = selectedCT?.schema.find(
    (f) => f.type === 'text' || f.type === 'textarea',
  );

  useEffect(() => {
    if (!firstTextField || editingEntry) return;
    const sub = watch((values, { name }) => {
      if (!name) return;
      if (name === 'slug') {
        slugManualRef.current = true;
        return;
      }
      if (slugManualRef.current) return;
      if (name === firstTextField.name) {
        const generated = toSlug(values[firstTextField.name] || '');
        setValue('slug', generated, { shouldValidate: false });
      }
    });
    return () => sub.unsubscribe();
  }, [firstTextField, editingEntry, watch, setValue]);

  /* ── Load entries ───────────────────────────────────────────────────── */
  const loadEntries = async (ct: ContentType) => {
    setLoadingEntries(true);
    try {
      const res = await api.get('/entries', { params: { contentTypeId: ct.id } });
      setEntries(res.data);
    } catch {
      toast.error('Failed to load entries');
    } finally {
      setLoadingEntries(false);
    }
  };

  const handleSelectCT = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) {
      setSelectedCT(null);
      setEntries([]);
      return;
    }
    const ct = contentTypes.find((c) => c.id === id) || null;
    setSelectedCT(ct);
    setEntries([]);
    if (ct) await loadEntries(ct);
  };

  /* ── Modal helpers ─────────────────────────────────────────────────── */
  const openCreateModal = () => {
    setEditingEntry(null);
    slugManualRef.current = false;
    reset({});
    setModalOpen(true);
  };

  const openEditModal = (entry: Entry) => {
    setEditingEntry(entry);
    slugManualRef.current = true;
    reset({ slug: entry.slug, ...entry.data });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEntry(null);
  };

  /* ── Submit ────────────────────────────────────────────────────────── */
  const onSubmit = async (values: Record<string, any>) => {
    if (!selectedCT) return;
    setSubmitting(true);
    try {
      const { slug, ...rest } = values;
      if (editingEntry) {
        await api.put(`/entries/${editingEntry.id}`, { slug, data: rest });
        toast.success('Entry updated');
      } else {
        await api.post('/entries', {
          contentTypeId: selectedCT.id,
          slug,
          data: rest,
        });
        toast.success('Entry created');
      }
      closeModal();
      await loadEntries(selectedCT);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Delete ────────────────────────────────────────────────────────── */
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/entries/${id}`);
      toast.success('Entry deleted');
      if (selectedCT) await loadEntries(selectedCT);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  /* ── Table column headers from schema ──────────────────────────────── */
  const schemaColumns = selectedCT?.schema.slice(0, 3) || [];

  /* ─── render ──────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Entries</h1>
        <Button
          size="sm"
          disabled={!selectedCT}
          onClick={openCreateModal}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create Entry
        </Button>
      </div>

      {/* Content type selector */}
      <div className="flex items-center gap-3">
        <Label htmlFor="ct-select" className="shrink-0 text-sm font-medium">
          Content Type:
        </Label>
        <select
          id="ct-select"
          disabled={loadingCT}
          onChange={handleSelectCT}
          defaultValue=""
          className={cn(
            'w-64 rounded-md border border-input bg-background px-3 py-2 text-sm',
            'ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <option value="">
            {loadingCT ? 'Loading…' : 'Select a content type'}
          </option>
          {contentTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name}
            </option>
          ))}
        </select>
      </div>

      {/* Entries table / empty state */}
      {!selectedCT ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FileText className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Select a content type to view its entries
          </p>
        </div>
      ) : loadingEntries ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm text-muted-foreground">Loading entries…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No entries yet. Click &ldquo;Create Entry&rdquo; to add one.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Slug
                </th>
                {schemaColumns.map((col) => (
                  <th
                    key={col.name}
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    {col.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Updated
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.id}
                  className={cn(
                    'border-b last:border-0',
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                    'hover:bg-muted/40 transition-colors',
                  )}
                >
                  {/* Slug */}
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {entry.slug}
                    </Badge>
                  </td>

                  {/* Schema columns */}
                  {schemaColumns.map((col) => {
                    const val = entry.data[col.name];
                    return (
                      <td key={col.name} className="px-4 py-3 text-muted-foreground">
                        {val === undefined || val === null ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : col.type === 'boolean' ? (
                          <Badge
                            variant={val ? 'default' : 'outline'}
                            className="text-xs"
                          >
                            {val ? 'Yes' : 'No'}
                          </Badge>
                        ) : col.type === 'image' && val ? (
                          <img
                            src={val}
                            alt=""
                            className="h-9 w-12 rounded object-cover"
                          />
                        ) : (
                          truncate(val)
                        )}
                      </td>
                    );
                  })}

                  {/* Updated date */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(entry.updatedAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEditModal(entry)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the entry{' '}
                              <strong>{entry.slug}</strong>. This action cannot be
                              undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDelete(entry.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEntry
                ? `Edit Entry — ${selectedCT?.name}`
                : `New Entry — ${selectedCT?.name}`}
            </DialogTitle>
          </DialogHeader>

          <form
            id="entry-form"
            onSubmit={handleSubmit(onSubmit)}
            className="mt-2 space-y-1"
          >
            {/* Slug field */}
            <div className="mb-4">
              <Label htmlFor="slug" className="mb-1.5 block text-sm font-medium">
                Slug
              </Label>
              {(() => {
                const slugReg = register('slug', {
                  required: 'Slug is required',
                  pattern: {
                    value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                    message: 'Use lowercase letters, numbers and hyphens only',
                  },
                });
                return (
                  <Input
                    id="slug"
                    placeholder="my-entry-slug"
                    disabled={!!editingEntry}
                    {...slugReg}
                    onChange={(e) => {
                      slugManualRef.current = true;
                      slugReg.onChange(e);
                    }}
                    className={cn(
                      errors.slug && 'border-destructive focus-visible:ring-destructive',
                      editingEntry && 'cursor-not-allowed opacity-60',
                    )}
                  />
                );
              })()}
              {errors.slug ? (
                <p className="mt-1 text-xs text-destructive">
                  {errors.slug.message as string}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {editingEntry
                    ? 'Slug cannot be changed after creation'
                    : 'Auto-generated from the first text field — you can override it'}
                </p>
              )}
            </div>

            {/* Divider + dynamic schema fields */}
            {selectedCT && selectedCT.schema.length > 0 && (
              <>
                <div className="flex items-center gap-3 py-1">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">Fields</span>
                  <Separator className="flex-1" />
                </div>

                <div className="pt-1">
                  {selectedCT.schema.map((field) => (
                    <DynamicFormField
                      key={field.name}
                      field={field}
                      control={control}
                      register={register}
                      errors={errors}
                      watch={watch}
                    />
                  ))}
                </div>
              </>
            )}
          </form>

          <DialogFooter className="pt-2">
            <Button variant="outline" type="button" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="entry-form"
              disabled={submitting}
            >
              {submitting
                ? editingEntry
                  ? 'Updating…'
                  : 'Creating…'
                : editingEntry
                ? 'Update'
                : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
