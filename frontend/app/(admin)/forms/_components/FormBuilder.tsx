'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';

export interface FormField {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  options?: string;     // comma-separated, for select | radio
  placeholder?: string;
}

export interface EmailAction {
  type: 'email';
  to: string;
  subject: string;
  replyToField?: string;
}

export interface WebhookAction {
  type: 'webhook';
  url: string;
  method: 'POST' | 'PUT';
}

export type ActionDef = EmailAction | WebhookAction;

export interface FormBuilderProps {
  mode: 'new' | 'edit';
  initialName?:    string;
  initialSlug?:    string;
  initialFields?:  FormField[];
  initialActions?: ActionDef[];
  initialActive?:  boolean;
  formId?:         number;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'email',    label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number',   label: 'Number' },
  { value: 'select',   label: 'Select (dropdown)' },
  { value: 'radio',    label: 'Radio (single pick)' },
  { value: 'checkbox', label: 'Checkbox (yes/no)' },
];

const toSlug = (v: string) =>
  v.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');

const toFieldKey = (v: string) =>
  v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

// ── Builder ──────────────────────────────────────────────────────────────────

export default function FormBuilder({
  mode,
  initialName    = '',
  initialSlug    = '',
  initialFields  = [{ name: '', type: 'text', label: '', required: false }],
  initialActions = [],
  initialActive  = true,
  formId,
}: FormBuilderProps) {
  const router = useRouter();

  const [name,     setName]     = useState(initialName);
  const [slug,     setSlug]     = useState(initialSlug);
  const [slugDirty,setSlugDirty]= useState(mode === 'edit');
  const [isActive, setIsActive] = useState(initialActive);
  const [fields,    setFields]    = useState<FormField[]>(initialFields);
  // Parallel array: true = user manually typed the key, stop auto-deriving from label
  const [keyDirty,  setKeyDirty]  = useState<boolean[]>(
    () => initialFields.map((f) => !!f.name.trim()),
  );
  const [actions,  setActions]  = useState<ActionDef[]>(initialActions);
  const [submitting, setSubmitting] = useState(false);

  // ── Slug auto-gen ─────────────────────────────────────────────────────────
  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugDirty) setSlug(toSlug(v));
  };

  // ── Field helpers ─────────────────────────────────────────────────────────
  const addField = () => {
    setFields([...fields, { name: '', type: 'text', label: '', required: false }]);
    setKeyDirty([...keyDirty, false]); // new field: auto-derive enabled
  };

  const removeField = (i: number) => {
    setFields(fields.filter((_, idx) => idx !== i));
    setKeyDirty(keyDirty.filter((_, idx) => idx !== i));
  };

  const updateField = <K extends keyof FormField>(i: number, key: K, val: FormField[K]) => {
    const next = [...fields];
    next[i] = { ...next[i], [key]: val };

    if (key === 'label' && !keyDirty[i]) {
      // Auto-derive field key from label as long as user hasn't manually edited it
      next[i].name = toFieldKey(val as string);
    }

    if (key === 'type' && val !== 'select' && val !== 'radio') delete next[i].options;
    setFields(next);
  };

  const updateFieldKey = (i: number, val: string) => {
    // User is manually editing the key — lock it and stop auto-deriving
    const next = [...fields];
    next[i] = { ...next[i], name: toFieldKey(val) };
    setFields(next);
    if (!keyDirty[i]) {
      const nextDirty = [...keyDirty];
      nextDirty[i] = true;
      setKeyDirty(nextDirty);
    }
  };

  // ── Action helpers ────────────────────────────────────────────────────────
  const addEmailAction = () =>
    setActions([...actions, { type: 'email', to: '', subject: 'New submission from {{name}}' }]);

  const addWebhookAction = () =>
    setActions([...actions, { type: 'webhook', url: '', method: 'POST' }]);

  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));

  const updateAction = (i: number, patch: Partial<ActionDef>) => {
    const next = [...actions];
    next[i] = { ...next[i], ...patch } as ActionDef;
    setActions(next);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) { toast.error('Form name is required'); return; }
    if (!slug.trim()) { toast.error('Slug is required'); return; }

    const validFields = fields.filter((f) => f.name.trim() && f.label.trim());
    if (validFields.length === 0) {
      toast.error('Add at least one field with a name and label');
      return;
    }

    // Normalise field names
    const normalizedFields = validFields.map((f) => ({
      ...f,
      name:    toFieldKey(f.name),
      options: (f.type === 'select' || f.type === 'radio') && f.options
        ? f.options.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined,
    }));

    const payload = {
      name: name.trim(),
      slug,
      fields:   normalizedFields,
      actions:  actions.filter((a) => {
        if (a.type === 'email')   return a.to.trim() && a.subject.trim();
        if (a.type === 'webhook') return a.url.trim();
        return false;
      }),
      isActive,
    };

    setSubmitting(true);
    try {
      if (mode === 'new') {
        await api.post('/forms', payload);
        toast.success('Form created');
      } else {
        await api.put(`/forms/${formId}`, payload);
        toast.success('Form updated');
      }
      router.push('/forms');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => router.push('/forms')}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Forms
      </Button>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Meta ── */}
        <Card>
          <CardHeader>
            <CardTitle>{mode === 'new' ? 'New Form' : 'Edit Form'}</CardTitle>
            <CardDescription>
              {mode === 'new'
                ? 'Define your form fields and configure notification actions.'
                : 'Update form settings, fields, and actions.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Form Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Contact Us"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. contact-us"
                  value={slug}
                  onChange={(e) => { setSlug(toSlug(e.target.value)); setSlugDirty(true); }}
                />
                {slug && (
                  <p className="text-xs text-muted-foreground">
                    Submit endpoint:{' '}
                    <code className="bg-muted px-1 py-0.5 rounded font-mono">
                      POST /api/submit/<strong>{slug}</strong>
                    </code>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Form Status</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isActive ? 'Accepting submissions' : 'Submissions are blocked'}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-medium ${isActive ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  id="is-active"
                  className="data-checked:bg-emerald-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Fields ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Fields</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Define the inputs users will fill in.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Field
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, fi) => (
              <div key={fi} className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-semibold text-muted-foreground w-5 shrink-0 text-right select-none mt-2.5">
                    {fi + 1}
                  </span>

                  {/* Label + Field Key */}
                  <div className="flex-1 space-y-2">
                    {/* Label */}
                    <Input
                      placeholder="Label shown to user"
                      value={field.label}
                      onChange={(e) => updateField(fi, 'label', e.target.value)}
                    />

                    {/* Field Key */}
                    <div className="relative">
                      <Input
                        placeholder="field_key"
                        value={field.name}
                        onChange={(e) => updateFieldKey(fi, e.target.value)}
                        className="font-mono text-xs pr-14"
                      />
                      {field.name && (
                        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium border rounded px-1.5 py-0.5 pointer-events-none ${
                          keyDirty[fi]
                            ? 'bg-muted text-muted-foreground border-border'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}>
                          {keyDirty[fi] ? 'custom' : 'auto'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Type */}
                  <Select
                    value={field.type}
                    onValueChange={(v) => updateField(fi, 'type', v as FieldType)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Required */}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer mt-2.5">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(c) => updateField(fi, 'required', c === true)}
                    />
                    Required
                  </label>

                  {/* Remove */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 mt-1"
                    disabled={fields.length === 1}
                    onClick={() => removeField(fi)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Options (select / radio) */}
                {(field.type === 'select' || field.type === 'radio') && (
                  <div className="pl-7 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Options (comma-separated)
                      <span className="ml-1 text-muted-foreground/50">
                        — shown as {field.type === 'radio' ? 'radio buttons' : 'dropdown'}
                      </span>
                    </Label>
                    <Input
                      placeholder="Option A, Option B, Option C"
                      value={field.options ?? ''}
                      onChange={(e) => updateField(fi, 'options', e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Actions ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Actions</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                What happens after a successful submission. Use <code className="font-mono bg-muted px-1 rounded">{'{{field_name}}'}</code> in subject to insert values.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addEmailAction}>
                <Plus className="h-4 w-4 mr-1" /> Email
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addWebhookAction}>
                <Plus className="h-4 w-4 mr-1" /> Webhook
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {actions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No actions configured. Submissions will only be stored in the database.
              </p>
            )}
            {actions.map((action, ai) => (
              <div key={ai} className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                    action.type === 'email' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                  }`}>
                    {action.type}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeAction(ai)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {action.type === 'email' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Send To</Label>
                      <Input
                        type="email"
                        placeholder="admin@example.com"
                        value={action.to}
                        onChange={(e) => updateAction(ai, { to: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Subject</Label>
                      <Input
                        placeholder="New submission from {{full_name}}"
                        value={action.subject}
                        onChange={(e) => updateAction(ai, { subject: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Reply-To Field (optional)</Label>
                      <Select
                        value={(action as EmailAction).replyToField ?? '__none__'}
                        onValueChange={(v) =>
                          updateAction(ai, { replyToField: v === '__none__' ? undefined : (v || undefined) })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {fields
                            .filter((f) => f.type === 'email' && f.name)
                            .map((f) => (
                              <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {action.type === 'webhook' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Webhook URL</Label>
                      <Input
                        placeholder="https://hooks.slack.com/…"
                        value={action.url}
                        onChange={(e) => updateAction(ai, { url: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Method</Label>
                      <Select
                        value={(action as WebhookAction).method}
                        onValueChange={(v) => updateAction(ai, { method: v as 'POST' | 'PUT' })}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/forms')}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? (mode === 'new' ? 'Creating…' : 'Saving…')
              : (mode === 'new' ? 'Create Form' : 'Save Changes')}
          </Button>
        </div>

      </form>
    </div>
  );
}
