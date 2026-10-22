'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, Braces, Copy, Check, PanelRight, WrapText } from 'lucide-react';
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
import { FormField, blankField, isFieldValid, normalizeField, buildExamplePayload } from './field-types';
import { highlightCode } from '@/lib/highlight';
import { useTranslations } from 'use-intl';

// Small labeled code box with a copy button + syntax highlighting — used by the payload preview.
function CodeSnippet({ title, code, lang }: { title: string; code: string; lang?: string }) {
  const tc = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={copy} title={tc('copy')}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono leading-relaxed whitespace-pre">
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code, lang) }} />
      </pre>
    </div>
  );
}

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
  const t = useTranslations('forms');
  const tc = useTranslations('common');
  const router = useRouter();

  const [name,     setName]     = useState(initialName);
  const [slug,     setSlug]     = useState(initialSlug);
  const [slugDirty,setSlugDirty]= useState(mode === 'edit');
  const [isActive, setIsActive] = useState(initialActive);
  const [captchaEnabled, setCaptchaEnabled] = useState(initialCaptchaEnabled);
  const [fields,    setFields]    = useState<FormField[]>(initialFields);
  const [actions,  setActions]  = useState<ActionDef[]>(initialActions);
  const [submitting, setSubmitting] = useState(false);

  // Side-by-side payload preview box
  const [jsonOpen,  setJsonOpen]  = useState(true);
  const [jsonWrap,  setJsonWrap]  = useState(true);
  const [jsonCopied,setJsonCopied]= useState(false);

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
    setActions([...actions, { type: 'email', to: '', subject: t('builder.actions.defaultSubject', { field: '{{name}}' }) }]);

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

    if (!name.trim()) { toast.error(t('builder.validation.nameRequired')); return; }
    if (!slug.trim()) { toast.error(t('builder.validation.slugRequired')); return; }

    const validFields = fields.filter(isFieldValid);
    if (validFields.length === 0) {
      toast.error(t('builder.validation.fieldRequired'));
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
        toast.success(t('builder.created'));
      } else {
        await api.put(`/forms/${formId}`, payload);
        toast.success(t('builder.updated'));
      }
      router.push('/forms');
    } catch (err: any) {
      toast.error(err.response?.data?.message || tc('somethingWentWrong'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Payload preview (example submission body for API consumers) ────────────
  const previewFields = fields.filter(isFieldValid);
  const examplePayload = buildExamplePayload(previewFields);
  const previewSlug = slug || 'your-form-slug';
  const jsonBody = JSON.stringify(examplePayload, null, 2);
  const curlSnippet =
    `curl -X POST https://your-api.com/api/submit/${previewSlug} \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d '${JSON.stringify(examplePayload)}'`;
  const fetchSnippet =
    `await fetch('/api/submit/${previewSlug}', {\n` +
    `  method: 'POST',\n` +
    `  headers: { 'Content-Type': 'application/json' },\n` +
    `  body: JSON.stringify(${JSON.stringify(examplePayload, null, 2).replace(/\n/g, '\n  ')}),\n` +
    `});`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => router.push('/forms')}
      >
        <ArrowLeft className="h-4 w-4" /> {t('submissions.backToForms')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{mode === 'new' ? t('builder.newTitle') : t('builder.editTitle')}</CardTitle>
          <CardDescription>
            {mode === 'new'
              ? t('builder.newDescription')
              : t('builder.editDescription')}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          {/* Meta — full width */}
          <div className="border-t border-border px-6 py-5 space-y-6">

              {/* Form Name + Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('builder.formName')} <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder={t('builder.formNamePlaceholder')}
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('list.columns.slug')} <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder={t('builder.slugPlaceholder')}
                    value={slug}
                    onChange={(e) => { setSlug(toSlug(e.target.value)); setSlugDirty(true); }}
                  />
                  {slug && (
                    <p className="text-xs text-muted-foreground">
                      {t('builder.submitEndpoint')}{' '}
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
                  <p className="text-sm font-medium">{t('builder.status.title')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isActive ? t('builder.status.accepting') : t('builder.status.blocked')}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs font-medium ${isActive ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                    {isActive ? t('builder.status.active') : t('builder.status.inactive')}
                  </span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    id="is-active"
                    className="data-checked:bg-emerald-500"
                  />
                </div>
              </div>

              {/* Spam Protection */}
              <div className="flex items-center justify-between rounded-md border px-4 py-3">
                <div className="pr-4">
                  <p className="text-sm font-medium">{t('builder.captcha.title')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {captchaEnabled
                      ? t('builder.captcha.on')
                      : t('builder.captcha.off')}
                    {' '}{t.rich('builder.captcha.requires', {
                      env: 'CAPTCHA_PROVIDER',
                      code: (chunks) => <code className="bg-muted px-1 py-0.5 rounded font-mono">{chunks}</code>,
                    })}
                  </p>
                </div>
                <Switch
                  checked={captchaEnabled}
                  onCheckedChange={setCaptchaEnabled}
                  id="captcha-enabled"
                  className="data-checked:bg-emerald-500"
                />
              </div>

          </div>

          {/* Split: Fields / Actions + live payload preview */}
          <div className="flex items-start border-t border-border">
            <div style={{ width: jsonOpen ? '60%' : '100%' }} className="min-w-0 px-6 py-5 space-y-6">

              {/* Fields */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h3 className="text-base font-semibold">{t('builder.fields.title')}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('builder.fields.description')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!jsonOpen && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setJsonOpen(true)}
                      >
                        <PanelRight className="h-3.5 w-3.5" /> {t('builder.preview.show')}
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={addField}>
                      <Plus className="h-4 w-4 mr-1.5" /> {t('builder.fields.add')}
                    </Button>
                  </div>
                </div>
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
                {fields.length >= 4 && (
                  <div className="flex justify-end pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={addField}>
                      <Plus className="h-4 w-4 mr-1.5" /> {t('builder.fields.add')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h3 className="text-base font-semibold">{tc('actions')}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.rich('builder.actions.description', {
                        token: '{{field_name}}',
                        code: (chunks) => <code className="font-mono bg-muted px-1 rounded">{chunks}</code>,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addEmailAction}>
                      <Plus className="h-4 w-4 mr-1" /> {t('builder.actions.email')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addWebhookAction}>
                      <Plus className="h-4 w-4 mr-1" /> Webhook
                    </Button>
                  </div>
                </div>
                {actions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('builder.actions.empty')}
                  </p>
                )}
                {actions.map((action, ai) => (
                  <div key={ai} className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                        action.type === 'email' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                      }`}>
                        {action.type === 'email' ? t('builder.actions.email') : 'Webhook'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeAction(ai)}
                        aria-label={t('builder.actions.remove')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {action.type === 'email' && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t('builder.actions.sendTo')}</Label>
                          <Input
                            type="email"
                            placeholder="admin@example.com"
                            value={action.to}
                            onChange={(e) => updateAction(ai, { to: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('builder.actions.subject')}</Label>
                          <Input
                            placeholder={t('builder.actions.defaultSubject', { field: '{{full_name}}' })}
                            value={action.subject}
                            onChange={(e) => updateAction(ai, { subject: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('builder.actions.replyToField')}</Label>
                          <Select
                            value={(action as EmailAction).replyToField ?? '__none__'}
                            onValueChange={(v) =>
                              updateAction(ai, { replyToField: v === '__none__' ? undefined : (v || undefined) })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('none')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{tc('none')}</SelectItem>
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
                          <Label className="text-xs">{t('builder.actions.webhookUrl')}</Label>
                          <Input
                            placeholder="https://hooks.slack.com/…"
                            value={action.url}
                            onChange={(e) => updateAction(ai, { url: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('builder.actions.method')}</Label>
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
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => router.push('/forms')}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? (mode === 'new' ? t('builder.creating') : tc('saving'))
                    : (mode === 'new' ? t('builder.create') : t('builder.saveChanges'))}
                </Button>
              </div>
            </div>

          {/* Right: live payload preview, full height */}
          {jsonOpen && (
            <div style={{ width: '40%' }} className="min-w-0 border-l border-border">
              <div className="sticky top-4 px-4 py-4 space-y-3">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setJsonOpen(false)}
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                    {t('builder.preview.hide')}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{t('builder.preview.title')}</span>
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-500 rounded px-1.5 py-0.5">{t('builder.preview.live')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setJsonWrap((w) => !w)}
                      className={`flex items-center gap-1 text-[11px] transition-colors ${jsonWrap ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      title={jsonWrap ? t('builder.preview.disableWrap') : t('builder.preview.enableWrap')}
                    >
                      <WrapText className="h-3.5 w-3.5" /> {t('builder.preview.wrap')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(jsonBody);
                        setJsonCopied(true);
                        setTimeout(() => setJsonCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      title={t('builder.preview.copyJson')}
                    >
                      {jsonCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      {jsonCopied ? tc('copied') : tc('copy')}
                    </button>
                  </div>
                </div>

                {previewFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
                    {t('builder.preview.empty')}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      <code className="bg-muted px-1 py-0.5 rounded font-mono">POST /api/submit/{previewSlug}</code>
                    </p>
                    <pre className={`overflow-auto max-h-[70vh] p-3 rounded-md border border-border bg-muted/20 text-[11px] leading-relaxed text-foreground font-mono ${jsonWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                      <code dangerouslySetInnerHTML={{ __html: highlightCode(jsonBody, 'json') }} />
                    </pre>
                    <CodeSnippet title="curl" code={curlSnippet} lang="bash" />
                    <CodeSnippet title="fetch (JavaScript)" code={fetchSnippet} lang="javascript" />
                  </>
                )}
              </div>
            </div>
          )}
          </div>
        </form>
      </Card>
    </div>
  );
}
