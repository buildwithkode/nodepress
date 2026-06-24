'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import FieldEditor from './FieldEditor';
import { FormField, blankField, isFieldValid, normalizeField } from './field-types';

// Re-exported for consumers (e.g. the edit page) that import the field model.
export type { FormField } from './field-types';

// ── Action types ──────────────────────────────────────────────────────────────
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
  initialCaptchaEnabled?: boolean;
  formId?:         number;
}

const toSlug = (v: string) =>
  v.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');

// ── Builder ──────────────────────────────────────────────────────────────────

export default function FormBuilder({
  mode,
  initialName    = '',
  initialSlug    = '',
  initialFields  = [blankField()],
  initialActions = [],
  initialActive  = true,
  initialCaptchaEnabled = false,
  formId,
}: FormBuilderProps) {
  const router = useRouter();

  const [name,     setName]     = useState(initialName);
  const [slug,     setSlug]     = useState(initialSlug);
  const [slugDirty,setSlugDirty]= useState(mode === 'edit');
  const [isActive, setIsActive] = useState(initialActive);
  const [captchaEnabled, setCaptchaEnabled] = useState(initialCaptchaEnabled);
  const [fields,    setFields]    = useState<FormField[]>(initialFields);
  const [actions,  setActions]  = useState<ActionDef[]>(initialActions);
  const [submitting, setSubmitting] = useState(false);

  // ── Slug auto-gen ─────────────────────────────────────────────────────────
  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugDirty) setSlug(toSlug(v));
  };

  // ── Field helpers ─────────────────────────────────────────────────────────
  const lastFieldRef = useRef<HTMLDivElement | null>(null);
  const focusNewFieldRef = useRef(false);

  const addField = () => {
    focusNewFieldRef.current = true;
    setFields([...fields, blankField()]);
  };

  // After a field is appended, bring it into view and focus its first input
  useEffect(() => {
    if (!focusNewFieldRef.current) return;
    focusNewFieldRef.current = false;
    const el = lastFieldRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('input')?.focus();
  }, [fields.length]);

  const updateFieldAt = (i: number, next: FormField) =>
    setFields(fields.map((f, idx) => (idx === i ? next : f)));

  const removeFieldAt = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));

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

    const validFields = fields.filter(isFieldValid);
    if (validFields.length === 0) {
      toast.error('Add at least one field with a name and label');
      return;
    }

    const payload = {
      name: name.trim(),
      slug,
      fields:   validFields.map(normalizeField),
      actions:  actions.filter((a) => {
        if (a.type === 'email')   return a.to.trim() && a.subject.trim();
        if (a.type === 'webhook') return a.url.trim();
        return false;
      }),
      isActive,
      captchaEnabled,
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

            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="pr-4">
                <p className="text-sm font-medium">Spam Protection (Captcha)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {captchaEnabled
                    ? 'Submissions must include a valid captcha token.'
                    : 'Honeypot + rate limiting still apply. Turn on for captcha verification.'}
                  {' '}Requires <code className="bg-muted px-1 py-0.5 rounded font-mono">CAPTCHA_PROVIDER</code> in the backend env.
                </p>
              </div>
              <Switch
                checked={captchaEnabled}
                onCheckedChange={setCaptchaEnabled}
                id="captcha-enabled"
                className="data-checked:bg-emerald-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Fields ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Fields</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Define the inputs users will fill in. Use Group / Repeater for nested data.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Field
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, fi) => (
              <FieldEditor
                key={fi}
                field={field}
                depth={1}
                canRemove={fields.length > 1}
                onChange={(next) => updateFieldAt(fi, next)}
                onRemove={() => removeFieldAt(fi)}
                innerRef={fi === fields.length - 1 ? lastFieldRef : undefined}
              />
            ))}

            {/* Append a field without scrolling back up to the header button */}
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Field
              </Button>
            </div>
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
