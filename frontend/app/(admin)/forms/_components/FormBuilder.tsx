'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';

export interface FormField {
  _id:       string;      // client-only stable key for dnd-kit, stripped before save
  name:      string;
  type:      FieldType;
  label:     string;
  required:  boolean;
  options?:  string;      // comma-separated, for select | radio
  placeholder?: string;
}

export interface EmailAction {
  type: 'email';
  to: string;
  subject: string;
  replyToField?: string;
}

export interface EmailReplyAction {
  type: 'email-reply';
  toField: string;   // form field name holding the submitter's email
  subject: string;
  body?: string;     // optional personalised message above the submission table
}

export interface WebhookAction {
  type: 'webhook';
  url: string;
  method: 'POST' | 'PUT';
}

export type ActionDef = EmailAction | EmailReplyAction | WebhookAction;

export interface FormBuilderProps {
  mode: 'new' | 'edit';
  initialName?:           string;
  initialSlug?:           string;
  initialFields?:         Omit<FormField, '_id'>[];
  initialActions?:        ActionDef[];
  initialActive?:         boolean;
  initialCaptchaEnabled?: boolean;
  initialSuccessMessage?: string;
  initialRedirectUrl?:    string;
  formId?:                number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = 0;
const uid = () => `f-${Date.now()}-${_counter++}`;

const toSlug = (v: string) =>
  v.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');

const toFieldKey = (v: string) =>
  v.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'email',    label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number',   label: 'Number' },
  { value: 'select',   label: 'Select (dropdown)' },
  { value: 'radio',    label: 'Radio (single pick)' },
  { value: 'checkbox', label: 'Checkbox (yes/no)' },
];

// ── Sortable field row wrapper ────────────────────────────────────────────────

function SortableFieldCard({ id, children }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex:  isDragging ? 10  : undefined,
  };
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none mt-2.5"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return <div ref={setNodeRef} style={style}>{children(dragHandle)}</div>;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export default function FormBuilder({
  mode,
  initialName           = '',
  initialSlug           = '',
  initialFields         = [{ name: '', type: 'text', label: '', required: false }],
  initialActions        = [],
  initialActive         = true,
  initialCaptchaEnabled = false,
  initialSuccessMessage = '',
  initialRedirectUrl    = '',
  formId,
}: FormBuilderProps) {
  const router = useRouter();

  const [name,           setName]          = useState(initialName);
  const [slug,           setSlug]          = useState(initialSlug);
  const [slugDirty,      setSlugDirty]     = useState(mode === 'edit');
  const [isActive,       setIsActive]      = useState(initialActive);
  const [captchaEnabled, setCaptchaEnabled]= useState(initialCaptchaEnabled);
  const [successMessage, setSuccessMessage]= useState(initialSuccessMessage);
  const [redirectUrl,    setRedirectUrl]   = useState(initialRedirectUrl);
  const [fields,         setFields]        = useState<FormField[]>(() =>
    initialFields.map((f) => ({ ...f, _id: uid() })),
  );
  const [keyDirty, setKeyDirty] = useState<boolean[]>(() =>
    initialFields.map((f) => !!f.name.trim()),
  );
  const [actions,    setActions]    = useState<ActionDef[]>(initialActions);
  const [submitting, setSubmitting] = useState(false);

  // ── DnD ──────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f._id === active.id);
        const newIndex = prev.findIndex((f) => f._id === over.id);
        const next = arrayMove(prev, oldIndex, newIndex);
        setKeyDirty((kd) => arrayMove(kd, oldIndex, newIndex));
        return next;
      });
    }
  };

  // ── Slug auto-gen ─────────────────────────────────────────────────────────
  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugDirty) setSlug(toSlug(v));
  };

  // ── Field helpers ─────────────────────────────────────────────────────────
  const addField = () => {
    setFields([...fields, { _id: uid(), name: '', type: 'text', label: '', required: false }]);
    setKeyDirty([...keyDirty, false]);
  };

  const removeField = (i: number) => {
    setFields(fields.filter((_, idx) => idx !== i));
    setKeyDirty(keyDirty.filter((_, idx) => idx !== i));
  };

  const updateField = <K extends keyof FormField>(i: number, key: K, val: FormField[K]) => {
    const next = [...fields];
    next[i] = { ...next[i], [key]: val };
    if (key === 'label' && !keyDirty[i]) next[i].name = toFieldKey(val as string);
    if (key === 'type' && val !== 'select' && val !== 'radio') delete next[i].options;
    setFields(next);
  };

  const updateFieldKey = (i: number, val: string) => {
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
  const emailFields = fields.filter((f) => f.type === 'email' && f.name);

  const addEmailAction       = () => setActions([...actions, { type: 'email',       to: '', subject: 'New submission from {{name}}' }]);
  const addEmailReplyAction  = () => setActions([...actions, { type: 'email-reply', toField: emailFields[0]?.name ?? '', subject: 'We received your message' }]);
  const addWebhookAction     = () => setActions([...actions, { type: 'webhook',     url: '', method: 'POST' }]);

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

    // Strip internal _id before sending, normalise options
    const normalizedFields = validFields.map(({ _id: _ignored, ...f }) => ({
      ...f,
      name:    toFieldKey(f.name),
      options: (f.type === 'select' || f.type === 'radio') && f.options
        ? f.options.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined,
    }));

    const payload = {
      name: name.trim(),
      slug,
      fields:  normalizedFields,
      actions: actions.filter((a) => {
        if (a.type === 'email')       return a.to.trim() && a.subject.trim();
        if (a.type === 'email-reply') return a.toField.trim() && a.subject.trim();
        if (a.type === 'webhook')     return a.url.trim();
        return false;
      }),
      isActive,
      captchaEnabled,
      successMessage: successMessage.trim() || undefined,
      redirectUrl:    redirectUrl.trim()    || undefined,
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

            {/* Form Status */}
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
                <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" className="data-checked:bg-emerald-500" />
              </div>
            </div>

            {/* Captcha */}
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Captcha Protection</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {captchaEnabled
                    ? 'Requires X-Captcha-Token header on every submission'
                    : 'No captcha required — anyone can submit'}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-medium ${captchaEnabled ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {captchaEnabled ? 'On' : 'Off'}
                </span>
                <Switch checked={captchaEnabled} onCheckedChange={setCaptchaEnabled} id="captcha-enabled" className="data-checked:bg-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Submission Response ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submission Response</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Customise what the API returns after a successful submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Success Message</Label>
              <Input
                placeholder="Your submission has been received. (default)"
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Returned as <code className="bg-muted px-1 rounded font-mono">message</code> in the JSON response. Leave blank to use the default.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Redirect URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="https://example.com/thank-you"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Returned as <code className="bg-muted px-1 rounded font-mono">redirectUrl</code> in the response. Your frontend handles the actual redirect.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Fields ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Fields</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Drag to reorder. Define the inputs users will fill in.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Field
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f._id)} strategy={verticalListSortingStrategy}>
                {fields.map((field, fi) => (
                  <SortableFieldCard key={field._id} id={field._id}>
                    {(dragHandle) => (
                      <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          {dragHandle}

                          <span className="text-sm font-semibold text-muted-foreground w-5 shrink-0 text-right select-none mt-2.5">
                            {fi + 1}
                          </span>

                          {/* Label + Field Key */}
                          <div className="flex-1 space-y-2">
                            <Input
                              placeholder="Label shown to user"
                              value={field.label}
                              onChange={(e) => updateField(fi, 'label', e.target.value)}
                            />
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
                          <div className="pl-12 space-y-1">
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
                    )}
                  </SortableFieldCard>
                ))}
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>

        {/* ── Actions ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Actions</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                What happens after a successful submission. Use <code className="font-mono bg-muted px-1 rounded">{'{{field_name}}'}</code> in subject/body to insert values.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addEmailAction}>
                <Plus className="h-4 w-4 mr-1" /> Notify Email
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addEmailReplyAction} disabled={emailFields.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Auto-reply
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
                    action.type === 'email'       ? 'bg-blue-500/10 text-blue-400'   :
                    action.type === 'email-reply' ? 'bg-cyan-500/10 text-cyan-400'   :
                                                    'bg-purple-500/10 text-purple-400'
                  }`}>
                    {action.type === 'email-reply' ? 'Auto-reply' : action.type}
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

                {/* Notify email action */}
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
                          {emailFields.map((f) => (
                            <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Auto-reply action */}
                {action.type === 'email-reply' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Submitter Email Field</Label>
                      <Select
                        value={(action as EmailReplyAction).toField}
                        onValueChange={(v) => updateAction(ai, { toField: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select email field" />
                        </SelectTrigger>
                        <SelectContent>
                          {emailFields.map((f) => (
                            <SelectItem key={f.name} value={f.name}>{f.label || f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">The reply will be sent to this field's value.</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Subject</Label>
                      <Input
                        placeholder="We received your message, {{full_name}}"
                        value={(action as EmailReplyAction).subject}
                        onChange={(e) => updateAction(ai, { subject: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Custom Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Textarea
                        placeholder="Thank you for reaching out. We will get back to you within 24 hours."
                        value={(action as EmailReplyAction).body ?? ''}
                        onChange={(e) => updateAction(ai, { body: e.target.value || undefined })}
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Webhook action */}
                {action.type === 'webhook' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Webhook URL</Label>
                      <Input
                        placeholder="https://hooks.slack.com/…"
                        value={(action as WebhookAction).url}
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
