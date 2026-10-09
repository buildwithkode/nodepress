'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, Braces, Copy, Check, PanelRight, Search, ChevronDown, ChevronRight, WrapText, Rocket, Globe, Shield, Settings, X, Clock } from 'lucide-react';
import api from '@/lib/axios';
import { highlightCode } from '@/lib/highlight';
import { useAuth } from '@/context/AuthContext';
import { canManageSettings } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn, ctLabel, formatSlugInput, cleanSlug } from '@/lib/utils';
import DynamicFormField from '../DynamicFormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
];

interface Field { name: string; type: string; options?: any }
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[] }

export default function NewEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: me } = useAuth();
  const isAdmin = canManageSettings(me?.role);
  const ctId = Number(searchParams?.get('ct') ?? 0);

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedCT, setSelectedCT] = useState<ContentType | null>(null);
  const [loadingCT, setLoadingCT] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>('published');
  const [publishAt, setPublishAt] = useState('');
  const [locale, setLocale] = useState('en');
  // SEO fields
  const [seoOpen, setSeoOpen] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);
  const [leftPct, setLeftPct] = useState(58);
  const containerRef = useRef<HTMLDivElement>(null);
  const slugManualRef = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 30), 75));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<Record<string, any>>();
  const watchedValues = watch();
  const watchedSlug = watch('slug') || '';
  const previewSlug = cleanSlug(watchedSlug);

  useEffect(() => {
    api.get('/content-types')
      .then((res) => {
        const COMMERCE_CONTENT_TYPES = new Set(['orders', 'coupons']);
        const editorialCTs: ContentType[] = (res.data || []).filter(
          (c: ContentType) => !COMMERCE_CONTENT_TYPES.has(c.name.toLowerCase())
        );
        setContentTypes(editorialCTs);
        if (ctId) {
          const ct = editorialCTs.find((c: ContentType) => c.id === ctId) ?? null;
          setSelectedCT(ct);
        }
      })
      .catch(() => toast.error('Failed to load content types'))
      .finally(() => setLoadingCT(false));
  }, [ctId]);

  const firstTextField = selectedCT?.schema.find((f) => f.type === 'text' || f.type === 'textarea');

  useEffect(() => {
    if (!firstTextField) return;
    const sub = watch((values, { name }) => {
      if (!name) return;
      if (name === 'slug') { slugManualRef.current = true; return; }
      if (slugManualRef.current) return;
      if (name === firstTextField.name) setValue('slug', cleanSlug(values[firstTextField.name] || ''), { shouldValidate: false });
    });
    return () => sub.unsubscribe();
  }, [firstTextField, watch, setValue]);

  const onSubmit = async (values: Record<string, any>) => {
    if (!selectedCT) return;
    setSubmitting(true);
    try {
      const { slug, ...rest } = values;
      const cleanFinalSlug = cleanSlug(slug || '');
      const seo = {
        title: seoTitle.trim() || undefined,
        description: seoDescription.trim() || undefined,
        image: seoImage.trim() || undefined,
        noIndex: seoNoIndex || undefined,
      };
      const hasSeo = Object.values(seo).some((v) => v !== undefined);
      await api.post('/entries', {
        contentTypeId: selectedCT.id,
        slug: cleanFinalSlug,
        locale,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
        publishAt: status === 'draft' && publishAt ? new Date(publishAt).toISOString() : null,
      });
      toast.success('Entry created');
      router.push('/entries');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCT) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="space-y-4 pt-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push(selectedCT ? `/entries?ct=${selectedCT.name}` : '/entries')}>
          <ArrowLeft className="h-4 w-4" /> Back to {selectedCT ? ctLabel(selectedCT) : 'Entries'}
        </Button>
        {selectedCT && isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => router.push(`/content-types/${selectedCT.id}/edit`)}
              title="Edit Content Type Schema"
            >
              <Settings className="h-3.5 w-3.5 text-indigo-400" />
              Edit Schema
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => router.push(`/users/permissions?tab=fields&ct=${selectedCT.name}`)}
              title="Configure Field-Level Permissions"
            >
              <Shield className="h-3.5 w-3.5 text-amber-400" />
              Field Permissions
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>New Entry{selectedCT ? ` — ${ctLabel(selectedCT)}` : ''}</CardTitle>
              <CardDescription>Fill in the fields below to create a new entry.</CardDescription>
            </div>
            {selectedCT && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Language Selector */}
                <Select value={locale} onValueChange={(v) => { if (v) setLocale(v); }}>
                  <SelectTrigger className="h-8 w-36 text-xs font-medium border-border/80 bg-background/80">
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{SUPPORTED_LOCALES.find((l) => l.code === locale)?.label || locale.toUpperCase()} ({locale.toUpperCase()})</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {SUPPORTED_LOCALES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        <div className="flex items-center gap-2">
                          <span>{l.flag}</span>
                          <span>{l.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">({l.code})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Selector */}
                <Select value={status} onValueChange={(v) => { if (v) setStatus(v); }}>
                  <SelectTrigger className="h-8 w-36 text-xs font-medium border-border/80 bg-background/80">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          status === 'published' && 'bg-emerald-500 ring-2 ring-emerald-500/20',
                          status === 'staging' && 'bg-purple-500 ring-2 ring-purple-500/20',
                          status === 'pending_review' && 'bg-blue-500 ring-2 ring-blue-500/20',
                          status === 'draft' && 'bg-amber-500 ring-2 ring-amber-500/20',
                          status === 'archived' && 'bg-zinc-500 ring-2 ring-zinc-500/20',
                        )}
                      />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="draft">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Draft</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="pending_review">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span>In Review</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="staging">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                        <span>Staging</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="published">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>Published</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="archived">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-zinc-500" />
                        <span>Archived</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Top Quick Create / Publish Button */}
                <Button type="submit" form="entry-form" size="sm" className="h-8 text-xs font-medium gap-1.5" disabled={submitting}>
                  {submitting ? 'Creating…' : status === 'published' ? 'Publish' : 'Create'}
                </Button>

                <Button
                  type="button"
                  variant={jsonOpen ? 'secondary' : 'outline'}
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 text-xs font-medium transition-all",
                    jsonOpen && "bg-muted text-foreground border-border/80 shadow-xs"
                  )}
                  onClick={() => setJsonOpen((v) => !v)}
                  title="Toggle Live JSON Preview"
                >
                  <Braces className="h-3.5 w-3.5" />
                  JSON
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <div ref={containerRef} className="flex items-start border-t border-border">
          {/* Left pane: form */}
          <div style={{ width: selectedCT && jsonOpen ? `${leftPct}%` : '100%' }} className="min-w-0 px-6 py-4">
            {/* Content type selector (if not pre-selected) */}
            {!ctId && (
              <div className="mb-5 space-y-1.5">
                <Label>Content Type</Label>
                <Select
                  value={selectedCT ? String(selectedCT.id) : ''}
                  onValueChange={(val) => {
                    const ct = contentTypes.find((c) => c.id === Number(val)) ?? null;
                    setSelectedCT(ct);
                    slugManualRef.current = false;
                    reset({});
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a content type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {contentTypes.map((ct) => (
                      <SelectItem key={ct.id} value={String(ct.id)}>{ctLabel(ct)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedCT && (
              <form id="entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                {/* Slug */}
                <div className="space-y-1.5 mb-5">
                  <Label htmlFor="slug" className="text-xs font-semibold text-foreground/90 block">Slug</Label>
                  {(() => {
                    const slugReg = register('slug', {
                      validate: (v) => {
                        const cleaned = cleanSlug(v || '');
                        if (!cleaned) return 'Slug is required';
                        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned)) {
                          return 'Lowercase letters, numbers and hyphens only';
                        }
                        return true;
                      },
                    });
                    return (
                      <Input
                        id="slug"
                        placeholder="my-entry-slug"
                        {...slugReg}
                        onChange={(e) => {
                          slugManualRef.current = true;
                          const target = e.target;
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const oldVal = target.value;
                          const formatted = formatSlugInput(oldVal);
                          target.value = formatted;
                          if (start !== null && end !== null && formatted.length === oldVal.length) {
                            target.setSelectionRange(start, end);
                          }
                          slugReg.onChange(e);
                        }}
                        onBlur={(e) => {
                          const cleaned = cleanSlug(e.target.value);
                          if (e.target.value !== cleaned) {
                            e.target.value = cleaned;
                            setValue('slug', cleaned, { shouldValidate: true });
                          }
                          slugReg.onBlur(e);
                        }}
                        className={cn(errors.slug && 'border-destructive focus-visible:ring-destructive')}
                      />
                    );
                  })()}
                  <div className="flex items-center gap-2 text-xs bg-muted/30 px-3 py-1.5 rounded-md border border-border/50 font-mono mt-1.5 text-muted-foreground">
                    <span className="text-[11px] font-sans font-medium text-muted-foreground/70 select-none shrink-0">
                      Preview URL:
                    </span>
                    <span className="truncate text-foreground font-medium">
                      /api/<span className="text-muted-foreground">{selectedCT ? selectedCT.name : 'content-type'}</span>/<span className="text-primary font-semibold">{previewSlug || '…'}</span>
                    </span>
                  </div>
                  {errors.slug ? (
                    <p className="mt-1 text-xs text-destructive">{errors.slug.message as string}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Auto-generated from the first text field. Formatted with lowercase and hyphens.</p>
                  )}
                </div>

                {/* Scheduled publish */}
                {status === 'draft' && (
                  <div className="mb-4 p-3.5 rounded-xl border border-border/80 bg-muted/20 backdrop-blur-xs">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Scheduled Publish
                      </Label>
                      {publishAt && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                          Active schedule
                        </span>
                      )}
                    </div>
                    <DateTimePicker
                      value={publishAt}
                      onChange={setPublishAt}
                      placeholder="Pick date & time to auto-publish…"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {publishAt ? (
                        <span className="text-foreground/90 font-medium">
                          Will automatically publish on{' '}
                          <span className="text-primary font-semibold">
                            {new Date(publishAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            at{' '}
                            {new Date(publishAt).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      ) : (
                        'Set a date and time to automatically publish this draft. Leave empty to publish manually.'
                      )}
                    </p>
                  </div>
                )}

                {selectedCT.schema.length > 0 && (
                  <div className="pt-6">
                    <div className="flex items-center justify-between pb-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-foreground">Fields</span>
                        {selectedCT.displayName && (
                          <span className="text-xs text-muted-foreground font-normal">
                            ({selectedCT.displayName})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {selectedCT.schema.length} field{selectedCT.schema.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <Separator className="mt-1 mb-5 bg-border/70" />

                    <div>
                      {selectedCT.schema.map((field) => (
                        <DynamicFormField key={field.name} field={field} control={control} register={register} errors={errors} watch={watch} />
                      ))}
                    </div>
                  </div>
                )}

                {/* SEO Panel */}
                <div className="mt-6">
                  <div className="pt-3 pb-2 mb-1">
                    <span className="text-base font-semibold text-foreground">SEO</span>
                    <Separator className="mt-1 mb-3 bg-border/70" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSeoOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left px-1 py-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>SEO &amp; Open Graph</span>
                    {(seoTitle || seoDescription || seoImage || seoNoIndex) && (
                      <span className="ml-auto text-[10px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5">customized</span>
                    )}
                    {seoOpen
                      ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                      : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    }
                  </button>

                  {seoOpen && (
                    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3 mt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="seo-title" className="text-xs">SEO Title</Label>
                        <Input
                          id="seo-title"
                          placeholder="Overrides the page title in search results"
                          value={seoTitle}
                          onChange={(e) => setSeoTitle(e.target.value)}
                          maxLength={70}
                        />
                        <p className="text-[10px] text-muted-foreground">{seoTitle.length}/70 characters</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="seo-desc" className="text-xs">Meta Description</Label>
                        <textarea
                          id="seo-desc"
                          placeholder="Short description shown in search results (120–160 chars recommended)"
                          value={seoDescription}
                          onChange={(e) => setSeoDescription(e.target.value)}
                          maxLength={160}
                          rows={2}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground">{seoDescription.length}/160 characters</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="seo-image" className="text-xs">OG Image URL</Label>
                        <Input
                          id="seo-image"
                          placeholder="https://example.com/og-image.jpg (1200×630 recommended)"
                          value={seoImage}
                          onChange={(e) => setSeoImage(e.target.value)}
                        />
                      </div>

                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={seoNoIndex}
                          onChange={(e) => setSeoNoIndex(e.target.checked)}
                          className="h-4 w-4 rounded border border-input"
                        />
                        <span className="text-xs text-foreground">Exclude from search engines (noindex)</span>
                      </label>
                    </div>
                  )}
                </div>
              </form>
            )}

            {!selectedCT && ctId === 0 && (
              <p className="text-sm text-muted-foreground py-4">Select a content type to begin.</p>
            )}
          </div>

          {/* Drag handle */}
          {selectedCT && jsonOpen && (
            <div
              onMouseDown={onDragStart}
              className="relative w-px self-stretch shrink-0 cursor-col-resize group select-none bg-border hover:bg-primary/40 transition-colors"
            >
              <div className="absolute inset-y-0 -left-2 -right-2" />
            </div>
          )}

          {/* Right pane: JSON preview */}
          {selectedCT && jsonOpen && (() => {
            const { slug, ...fieldData } = watchedValues;
            const previewSeo = {
              title: seoTitle.trim() || undefined,
              description: seoDescription.trim() || undefined,
              image: seoImage.trim() || undefined,
              noIndex: seoNoIndex || undefined,
            };
            const hasSeo = Object.values(previewSeo).some((v) => v !== undefined);
            const liveJson = {
              slug: slug ?? '',
              status,
              locale,
              contentTypeId: selectedCT.id,
              data: fieldData,
              seo: hasSeo ? previewSeo : null,
              publishAt: status === 'draft' && publishAt ? new Date(publishAt).toISOString() : null,
            };
            const jsonStr = JSON.stringify(liveJson, null, 2);
            return (
              <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 border-l border-border">
                <div className="sticky top-4 px-4 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">JSON Preview</span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-500 rounded px-1.5 py-0.5">live</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setJsonWrap((w) => !w)}
                        className={`flex items-center gap-1 text-[11px] transition-colors ${jsonWrap ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        title={jsonWrap ? 'Disable line wrap' : 'Wrap long lines'}
                      >
                        <WrapText className="h-3.5 w-3.5" />
                        Wrap
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(jsonStr);
                          setJsonCopied(true);
                          setTimeout(() => setJsonCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy raw JSON"
                      >
                        {jsonCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {jsonCopied ? 'Copied' : 'Copy'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground ml-1"
                        onClick={() => setJsonOpen(false)}
                        title="Close JSON Panel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <pre className={`overflow-auto max-h-[75vh] p-3 rounded-md border border-border bg-muted/20 text-[11px] leading-relaxed text-foreground font-mono ${jsonWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}><code dangerouslySetInnerHTML={{ __html: highlightCode(jsonStr, 'json') }} /></pre>
                </div>
              </div>
            );
          })()}
        </div>

        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/entries')}>Cancel</Button>
          <Button type="submit" form="entry-form" disabled={submitting || !selectedCT}>
            {submitting ? 'Creating…' : 'Create Entry'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
