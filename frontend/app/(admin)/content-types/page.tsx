'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const FIELD_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'number',   label: 'Number' },
  { value: 'boolean',  label: 'Boolean' },
  { value: 'select',   label: 'Select' },
  { value: 'image',    label: 'Image' },
  { value: 'repeater', label: 'Repeater' },
  { value: 'flexible', label: 'Flexible Content' },
];

const SIMPLE_FIELD_TYPES = FIELD_TYPES.filter(
  (t) => t.value !== 'repeater' && t.value !== 'flexible',
);

const FIELD_TYPE_BADGE: Record<string, string> = {
  text:     'bg-blue-100 text-blue-700',
  textarea: 'bg-cyan-100 text-cyan-700',
  richtext: 'bg-indigo-100 text-indigo-700',
  number:   'bg-purple-100 text-purple-700',
  boolean:  'bg-orange-100 text-orange-700',
  select:   'bg-yellow-100 text-yellow-700',
  image:    'bg-green-100 text-green-700',
  repeater: 'bg-red-100 text-red-700',
  flexible: 'bg-pink-100 text-pink-700',
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
// Small helpers
// ---------------------------------------------------------------------------
function FieldTypeSelect({
  value,
  onChange,
  types = FIELD_TYPES,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  types?: typeof FIELD_TYPES;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
        'focus:outline-none focus:ring-1 focus:ring-ring',
        className,
      )}
    >
      {types.map((t) => (
        <option key={t.value} value={t.value}>{t.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ContentTypesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading]           = useState(false);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingItem, setEditingItem]   = useState<ContentType | null>(null);
  const [name, setName]                 = useState('');
  const [nameError, setNameError]       = useState('');
  const [fields, setFields]             = useState<Field[]>([{ name: '', type: 'text', required: false }]);
  const [openLayouts, setOpenLayouts]   = useState<Record<string, boolean>>({});

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

  // ---- modal open/close ----
  const openCreateModal = () => {
    setEditingItem(null);
    setName('');
    setNameError('');
    setFields([{ name: '', type: 'text', required: false }]);
    setOpenLayouts({});
    setModalOpen(true);
  };

  const openEditModal = (item: ContentType) => {
    setEditingItem(item);
    setName(item.name);
    setNameError('');
    setFields(
      item.schema.length > 0
        ? item.schema.map((f) => ({ ...f, required: f.required ?? false }))
        : [{ name: '', type: 'text', required: false }],
    );
    setOpenLayouts({});
    setModalOpen(true);
  };

  // ---- field helpers ----
  const addField = () =>
    setFields([...fields, { name: '', type: 'text', required: false }]);

  const removeField = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));

  const updateField = (i: number, key: keyof Field, val: any) => {
    const updated = [...fields];
    if (key === 'type') {
      updated[i] = { ...updated[i], type: val, options: undefined };
      if (val === 'repeater') updated[i].options = { subFields: [{ name: '', type: 'text' }] };
      if (val === 'flexible') updated[i].options = { layouts: [{ name: 'section', label: 'Section', fields: [{ name: '', type: 'text' }] }] };
    } else {
      (updated[i] as any)[key] = val;
    }
    setFields(updated);
  };

  // ---- repeater sub-field helpers ----
  const addSubField = (fi: number) => {
    const updated = [...fields];
    updated[fi].options!.subFields!.push({ name: '', type: 'text' });
    setFields(updated);
  };
  const removeSubField = (fi: number, si: number) => {
    const updated = [...fields];
    updated[fi].options!.subFields = updated[fi].options!.subFields!.filter((_, i) => i !== si);
    setFields(updated);
  };
  const updateSubField = (fi: number, si: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.subFields![si] as any)[key] = val;
    setFields(updated);
  };

  // ---- flexible layout helpers ----
  const addLayout = (fi: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts!.push({ name: '', label: '', fields: [{ name: '', type: 'text' }] });
    setFields(updated);
  };
  const removeLayout = (fi: number, li: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts = updated[fi].options!.layouts!.filter((_, i) => i !== li);
    setFields(updated);
  };
  const updateLayout = (fi: number, li: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.layouts![li] as any)[key] = val;
    setFields(updated);
  };
  const addLayoutField = (fi: number, li: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts![li].fields.push({ name: '', type: 'text' });
    setFields(updated);
  };
  const removeLayoutField = (fi: number, li: number, fli: number) => {
    const updated = [...fields];
    updated[fi].options!.layouts![li].fields = updated[fi].options!.layouts![li].fields.filter((_, i) => i !== fli);
    setFields(updated);
  };
  const updateLayoutField = (fi: number, li: number, fli: number, key: string, val: string) => {
    const updated = [...fields];
    (updated[fi].options!.layouts![li].fields[fli] as any)[key] = val;
    setFields(updated);
  };
  const toggleLayout = (key: string) =>
    setOpenLayouts((prev) => ({ ...prev, [key]: !prev[key] }));

  // ---- submit ----
  const handleSubmit = async () => {
    if (!name.trim()) { setNameError('Name is required'); return; }
    setNameError('');

    const validFields = fields.filter((f) => f.name.trim());
    if (validFields.length === 0) { toast.error('Add at least one field'); return; }

    const payload = {
      name: name.trim().toLowerCase().replace(/\s+/g, '_'),
      schema: validFields,
    };

    try {
      if (editingItem) {
        await api.put(`/content-types/${editingItem.id}`, payload);
        toast.success('Content type updated');
      } else {
        await api.post('/content-types', payload);
        toast.success('Content type created');
      }
      setModalOpen(false);
      fetchContentTypes();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    }
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
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Content Types</h1>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          New Content Type
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fields</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Count</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Created</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && contentTypes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No content types yet. Click "New Content Type" to create one.
                </td>
              </tr>
            )}
            {contentTypes.map((ct) => (
              <tr key={ct.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {/* Name */}
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    {ct.name}
                  </span>
                </td>
                {/* Field tags */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {ct.schema.map((f, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                          FIELD_TYPE_BADGE[f.type] ?? 'bg-gray-100 text-gray-700',
                        )}
                      >
                        {f.name}
                        <span className="ml-1 opacity-60">({f.type})</span>
                      </span>
                    ))}
                  </div>
                </td>
                {/* Count */}
                <td className="px-4 py-3">
                  <Badge variant="secondary">{ct.schema.length}</Badge>
                </td>
                {/* Created */}
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(ct.createdAt).toLocaleDateString()}
                </td>
                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(ct)}
                      className="h-8 w-8 p-0"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete content type?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All entries under <strong>{ct.name}</strong> will also be deleted. This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(ct.id)}
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

      {/* Create / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Content Type' : 'Create Content Type'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Content Type Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. blog, product, page"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
              <p className="text-xs text-muted-foreground">Auto-converted to snake_case</p>
            </div>

            {/* Fields section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Fields</span>
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-2">
                {fields.map((field, fi) => (
                  <div
                    key={fi}
                    className="rounded-md border bg-muted/30 p-3 space-y-2"
                  >
                    {/* Field row */}
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Field name"
                        value={field.name}
                        onChange={(e) => updateField(fi, 'name', e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      <FieldTypeSelect
                        value={field.type}
                        onChange={(val) => updateField(fi, 'type', val)}
                        className="w-40"
                      />
                      {/* Required checkbox */}
                      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!field.required}
                          onChange={(e) => updateField(fi, 'required', e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        Req<span className="text-destructive">*</span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        disabled={fields.length === 1}
                        onClick={() => removeField(fi)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Select choices */}
                    {field.type === 'select' && (
                      <div className="pl-1 space-y-1">
                        <label className="text-xs text-muted-foreground">
                          Choices (comma-separated)
                        </label>
                        <textarea
                          placeholder="option1, option2, option3"
                          value={field.options?.choices ?? ''}
                          onChange={(e) =>
                            updateField(fi, 'options', {
                              ...field.options,
                              choices: e.target.value,
                            })
                          }
                          rows={2}
                          className={cn(
                            'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm',
                            'focus:outline-none focus:ring-1 focus:ring-ring resize-none',
                          )}
                        />
                      </div>
                    )}

                    {/* Repeater sub-fields */}
                    {field.type === 'repeater' && field.options?.subFields && (
                      <div className="pl-3 border-l-2 border-red-400 mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Sub Fields</p>
                        {field.options.subFields.map((sf, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <Input
                              placeholder="sub-field name"
                              value={sf.name}
                              onChange={(e) => updateSubField(fi, si, 'name', e.target.value)}
                              className="flex-1 h-7 text-xs"
                            />
                            <FieldTypeSelect
                              value={sf.type}
                              onChange={(val) => updateSubField(fi, si, 'type', val)}
                              types={SIMPLE_FIELD_TYPES}
                              className="w-32 h-7 text-xs"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              disabled={field.options!.subFields!.length === 1}
                              onClick={() => removeSubField(fi, si)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs mt-1"
                          onClick={() => addSubField(fi)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Sub Field
                        </Button>
                      </div>
                    )}

                    {/* Flexible layouts */}
                    {field.type === 'flexible' && field.options?.layouts && (
                      <div className="pl-3 border-l-2 border-pink-400 mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Layouts</p>
                        {field.options.layouts.map((layout, li) => {
                          const layoutKey = `${fi}-${li}`;
                          const isOpen = openLayouts[layoutKey] ?? false;
                          return (
                            <div key={li} className="rounded border bg-background overflow-hidden">
                              {/* Layout header */}
                              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50">
                                <button
                                  type="button"
                                  onClick={() => toggleLayout(layoutKey)}
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                >
                                  {isOpen
                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                    : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                                <Input
                                  placeholder="layout name (e.g. hero)"
                                  value={layout.name}
                                  onChange={(e) => updateLayout(fi, li, 'name', e.target.value)}
                                  className="h-6 text-xs w-32"
                                />
                                <Input
                                  placeholder="label (e.g. Hero Section)"
                                  value={layout.label}
                                  onChange={(e) => updateLayout(fi, li, 'label', e.target.value)}
                                  className="h-6 text-xs flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                  disabled={field.options!.layouts!.length === 1}
                                  onClick={() => removeLayout(fi, li)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>

                              {/* Layout fields (collapsible) */}
                              {isOpen && (
                                <div className="px-3 py-2 space-y-1.5 border-t">
                                  {layout.fields.map((lf, fli) => (
                                    <div key={fli} className="flex items-center gap-2">
                                      <Input
                                        placeholder="field name"
                                        value={lf.name}
                                        onChange={(e) =>
                                          updateLayoutField(fi, li, fli, 'name', e.target.value)
                                        }
                                        className="flex-1 h-7 text-xs"
                                      />
                                      <FieldTypeSelect
                                        value={lf.type}
                                        onChange={(val) =>
                                          updateLayoutField(fi, li, fli, 'type', val)
                                        }
                                        types={SIMPLE_FIELD_TYPES}
                                        className="w-32 h-7 text-xs"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                        disabled={layout.fields.length === 1}
                                        onClick={() => removeLayoutField(fi, li, fli)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs mt-1"
                                    onClick={() => addLayoutField(fi, li)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Field
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addLayout(fi)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Layout
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
