'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

interface SubField { name: string; type: string }
interface Layout   { name: string; label: string; fields: SubField[] }
interface Field {
  name:     string;
  type:     string;
  required: boolean;
  options?: { subFields?: SubField[]; layouts?: Layout[]; choices?: string };
}

const toSnakeCase = (name: string) =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

function FieldTypeSelect({
  value, onChange, types = FIELD_TYPES, className,
}: {
  value: string; onChange: (v: string) => void;
  types?: typeof FIELD_TYPES; className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        {types.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function NewContentTypePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [fields, setFields] = useState<Field[]>([{ name: '', type: 'text', required: false }]);
  const [openLayouts, setOpenLayouts] = useState<Record<string, boolean>>({});

  const computedName = toSnakeCase(name);

  const addField = () => setFields([...fields, { name: '', type: 'text', required: false }]);
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof Field, val: any) => {
    const u = [...fields];
    if (key === 'type') {
      u[i] = { ...u[i], type: val, options: undefined };
      if (val === 'repeater') u[i].options = { subFields: [{ name: '', type: 'text' }] };
      if (val === 'flexible') u[i].options = { layouts: [{ name: 'section', label: 'Section', fields: [{ name: '', type: 'text' }] }] };
    } else { (u[i] as any)[key] = val; }
    setFields(u);
  };

  const addSubField = (fi: number) => {
    const u = [...fields]; u[fi].options!.subFields!.push({ name: '', type: 'text' }); setFields(u);
  };
  const removeSubField = (fi: number, si: number) => {
    const u = [...fields]; u[fi].options!.subFields = u[fi].options!.subFields!.filter((_, i) => i !== si); setFields(u);
  };
  const updateSubField = (fi: number, si: number, key: string, val: string) => {
    const u = [...fields]; (u[fi].options!.subFields![si] as any)[key] = val; setFields(u);
  };

  const addLayout = (fi: number) => {
    const u = [...fields]; u[fi].options!.layouts!.push({ name: '', label: '', fields: [{ name: '', type: 'text' }] }); setFields(u);
  };
  const removeLayout = (fi: number, li: number) => {
    const u = [...fields]; u[fi].options!.layouts = u[fi].options!.layouts!.filter((_, i) => i !== li); setFields(u);
  };
  const updateLayout = (fi: number, li: number, key: string, val: string) => {
    const u = [...fields]; (u[fi].options!.layouts![li] as any)[key] = val; setFields(u);
  };
  const addLayoutField = (fi: number, li: number) => {
    const u = [...fields]; u[fi].options!.layouts![li].fields.push({ name: '', type: 'text' }); setFields(u);
  };
  const removeLayoutField = (fi: number, li: number, fli: number) => {
    const u = [...fields]; u[fi].options!.layouts![li].fields = u[fi].options!.layouts![li].fields.filter((_, i) => i !== fli); setFields(u);
  };
  const updateLayoutField = (fi: number, li: number, fli: number, key: string, val: string) => {
    const u = [...fields]; (u[fi].options!.layouts![li].fields[fli] as any)[key] = val; setFields(u);
  };
  const toggleLayout = (key: string) => setOpenLayouts((p) => ({ ...p, [key]: !p[key] }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError('Name is required'); return; }
    setNameError('');
    const validFields = fields.filter((f) => f.name.trim());
    if (validFields.length === 0) { toast.error('Add at least one field'); return; }
    setSubmitting(true);
    try {
      await api.post('/content-types', { name: computedName, schema: validFields });
      toast.success('Content type created');
      router.push('/content-types');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/content-types')}>
        <ArrowLeft className="h-4 w-4" /> Back to Content Types
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New Content Type</CardTitle>
          <CardDescription>Define a schema with typed fields.</CardDescription>
        </CardHeader>

        <CardContent>
          <form id="ct-form" onSubmit={onSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. blog, team member, product"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
              />
              {nameError
                ? <p className="text-xs text-destructive">{nameError}</p>
                : computedName && (
                  <p className="text-xs text-muted-foreground">
                    API endpoint:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      GET /api/<strong>{computedName}</strong>
                    </code>
                  </p>
                )}
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label>Fields</Label>
                <Button variant="outline" onClick={addField}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Field
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, fi) => (
                  <div key={fi} className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground w-5 shrink-0 text-right select-none">
                        {fi + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <Input
                          placeholder="Field name"
                          value={field.name}
                          onChange={(e) => updateField(fi, 'name', e.target.value)}
                        />
                        {field.name.trim() && field.name.trim() !== field.name.trim().toLowerCase().replace(/[\s-]+/g, '_') && (
                          <p className="text-xs text-muted-foreground px-0.5">
                            API key: <code className="rounded bg-muted px-1 py-0.5 font-mono">{field.name.trim().toLowerCase().replace(/[\s-]+/g, '_')}</code>
                          </p>
                        )}
                      </div>
                      <FieldTypeSelect value={field.type} onChange={(val) => updateField(fi, 'type', val)} className="w-40" />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                        <Checkbox checked={!!field.required} onCheckedChange={(c) => updateField(fi, 'required', c === true)} />
                        Required
                      </label>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0" disabled={fields.length === 1} onClick={() => removeField(fi)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {field.type === 'select' && (
                      <div className="pl-7 space-y-1">
                        <Label className="text-xs text-muted-foreground">Choices (comma-separated)</Label>
                        <Textarea placeholder="option1, option2, option3" value={field.options?.choices ?? ''} onChange={(e) => updateField(fi, 'options', { ...field.options, choices: e.target.value })} rows={2} className="resize-none" />
                      </div>
                    )}

                    {field.type === 'repeater' && field.options?.subFields && (
                      <div className="pl-7">
                        <div className="border-l-2 border-orange-400 pl-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Sub Fields</p>
                          {field.options.subFields.map((sf, si) => (
                            <div key={si} className="flex items-center gap-2">
                              <Input placeholder="sub-field name" value={sf.name} onChange={(e) => updateSubField(fi, si, 'name', e.target.value)} className="flex-1" />
                              <FieldTypeSelect value={sf.type} onChange={(val) => updateSubField(fi, si, 'type', val)} types={SIMPLE_FIELD_TYPES} className="w-32" />
                              <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0" disabled={field.options!.subFields!.length === 1} onClick={() => removeSubField(fi, si)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button variant="outline" onClick={() => addSubField(fi)}>
                            <Plus className="h-4 w-4 mr-1.5" /> Add Sub Field
                          </Button>
                        </div>
                      </div>
                    )}

                    {field.type === 'flexible' && field.options?.layouts && (
                      <div className="pl-7">
                        <div className="border-l-2 border-pink-400 pl-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Layouts</p>
                          {field.options.layouts.map((layout, li) => {
                            const key = `${fi}-${li}`;
                            const isOpen = openLayouts[key] ?? false;
                            return (
                              <div key={li} className="rounded border bg-background overflow-hidden">
                                <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50">
                                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleLayout(key)} className="shrink-0 h-6 w-6">
                                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Input placeholder="layout name" value={layout.name} onChange={(e) => updateLayout(fi, li, 'name', e.target.value)} className="w-32" />
                                  <Input placeholder="label" value={layout.label} onChange={(e) => updateLayout(fi, li, 'label', e.target.value)} className="flex-1" />
                                  <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0" disabled={field.options!.layouts!.length === 1} onClick={() => removeLayout(fi, li)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {isOpen && (
                                  <div className="px-3 py-2 space-y-1.5 border-t">
                                    {layout.fields.map((lf, fli) => (
                                      <div key={fli} className="flex items-center gap-2">
                                        <Input placeholder="field name" value={lf.name} onChange={(e) => updateLayoutField(fi, li, fli, 'name', e.target.value)} className="flex-1" />
                                        <FieldTypeSelect value={lf.type} onChange={(val) => updateLayoutField(fi, li, fli, 'type', val)} types={SIMPLE_FIELD_TYPES} className="w-32" />
                                        <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0" disabled={layout.fields.length === 1} onClick={() => removeLayoutField(fi, li, fli)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button variant="outline" onClick={() => addLayoutField(fi, li)}>
                                      <Plus className="h-4 w-4 mr-1.5" /> Add Field
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <Button variant="outline" onClick={() => addLayout(fi)}>
                            <Plus className="h-4 w-4 mr-1.5" /> Add Layout
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/content-types')}>Cancel</Button>
          <Button type="submit" form="ct-form" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
