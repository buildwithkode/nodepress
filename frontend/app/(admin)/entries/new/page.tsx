'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, Braces, Copy, Check, PanelRight, Search, ChevronDown, ChevronRight, WrapText, Rocket, Globe, Shield, Settings } from 'lucide-react';
import api from '@/lib/axios';
import { highlightCode } from '@/lib/highlight';
import { useAuth } from '@/context/AuthContext';
import { canManageSettings } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn, ctLabel } from '@/lib/utils';
import DynamicFormField from '../DynamicFormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function toSlug(str: string) {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');
}

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
  const [locale, setLocale] = useState('en');
  // SEO fields
  const [seoOpen, setSeoOpen] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(true);
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

  useEffect(() => {
    api.get('/content-types')
      .then((res) => {
        setContentTypes(res.data);
        if (ctId) {
          const ct = res.data.find((c: ContentType) => c.id === ctId) ?? null;
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
      if (name === firstTextField.name) setValue('slug', toSlug(values[firstTextField.name] || ''), { shouldValidate: false });
    });
    return () => sub.unsubscribe();
  }, [firstTextField, watch, setValue]);

  const onSubmit = async (values: Record<string, any>) => {
    if (!selectedCT) return;
    setSubmitting(true);
    try {
      const { slug, ...rest } = values;
      const seo = {
        title: seoTitle.trim() || undefined,
        description: seoDescription.trim() || undefined,
        image: seoImage.trim() || undefined,
        noIndex: seoNoIndex || undefined,
      };
      const hasSeo = Object.values(seo).some((v) => v !== undefined);
      await api.post('/entries', { contentTypeId: selectedCT.id, slug, locale, status, data: rest, seo: hasSeo ? seo : null });
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>New Entry{selectedCT ? ` — ${ctLabel(selectedCT)}` : ''}</CardTitle>
              <CardDescription>Fill in the fields below to create a new entry.</CardDescription>
            </div>
            {selectedCT && (
              <Button
                type="button"
                variant={jsonOpen ? 'secondary' : 'outline'}
                size="sm"
                className="h-7 gap-1.5 text-xs shrink-0 mt-1"
                onClick={() => setJsonOpen((v) => !v)}
              >
                <PanelRight className="h-3.5 w-3.5" />
                {jsonOpen ? 'Hide JSON' : 'Show JSON'}
              </Button>
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
                {/* Publishing & Environment Promotion Pipeline */}
                <div className="rounded-xl border border-border bg-card/60 p-3.5 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Rocket className="h-4 w-4 text-purple-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Content Pipeline & Environment
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[11px] font-mono px-2 py-0.5',
                        status === 'published' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
                        status === 'staging' && 'border-purple-500/50 bg-purple-500/10 text-purple-400',
                        status === 'pending_review' && 'border-blue-500/50 bg-blue-500/10 text-blue-400',
                        status === 'draft' && 'border-amber-500/50 bg-amber-500/10 text-amber-400',
                        status === 'archived' && 'border-muted text-muted-foreground',
                      )}
                    >
                      Target: {status === 'published' ? 'Production' : status === 'staging' ? 'Staging (QA)' : status === 'pending_review' ? 'Pending Review' : status === 'draft' ? 'Draft' : 'Archived'}
                    </Badge>
                  </div>

                  {/* Progress Steps */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                    {[
                      { key: 'draft', label: '1. Draft', color: 'amber' },
                      { key: 'pending_review', label: '2. Review', color: 'blue' },
                      { key: 'staging', label: '3. Staging', color: 'purple' },
                      { key: 'published', label: '4. Production', color: 'emerald' },
                    ].map((step) => {
                      const isActive = status === step.key;
                      return (
                        <button
                          key={step.key}
                          type="button"
                          onClick={() => setStatus(step.key)}
                          className={cn(
                            'flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-all text-center',
                            isActive
                              ? step.color === 'emerald'
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-900/20'
                                : step.color === 'purple'
                                ? 'bg-purple-500/15 border-purple-500/50 text-purple-300 shadow-sm shadow-purple-900/20'
                                : step.color === 'blue'
                                ? 'bg-blue-500/15 border-blue-500/50 text-blue-300 shadow-sm shadow-blue-900/20'
                                : 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-900/20'
                              : 'bg-background/50 border-border/50 text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                          )}
                        >
                          <span>{step.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick stage toggle buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant={status === 'draft' ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setStatus('draft')}
                    >
                      Draft
                    </Button>
                    <Button
                      type="button"
                      variant={status === 'pending_review' ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 text-xs text-blue-400"
                      onClick={() => setStatus('pending_review')}
                    >
                      Submit for Review
                    </Button>
                    <Button
                      type="button"
                      variant={status === 'staging' ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 text-xs text-purple-400 border-purple-500/30 hover:bg-purple-950/30"
                      onClick={() => setStatus('staging')}
                    >
                      <Rocket className="h-3 w-3 mr-1" /> Target Staging
                    </Button>
                    <Button
                      type="button"
                      variant={status === 'published' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/30 ml-auto"
                      onClick={() => setStatus('published')}
                    >
                      <Globe className="h-3 w-3 mr-1" /> Target Production
                    </Button>
                  </div>
                </div>

                {/* Slug */}
                <div className="mb-4">
                  <Label htmlFor="slug" className="mb-1.5 block">Slug</Label>
                  {(() => {
                    const slugReg = register('slug', {
                      required: 'Slug is required',
                      pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Lowercase, numbers and hyphens only' },
                    });
                    return (
                      <Input
                        id="slug"
                        placeholder="my-entry-slug"
                        {...slugReg}
                        onChange={(e) => { slugManualRef.current = true; slugReg.onChange(e); }}
                        className={cn(errors.slug && 'border-destructive focus-visible:ring-destructive')}
                      />
                    );
                  })()}
                  {errors.slug
                    ? <p className="mt-1 text-xs text-destructive">{errors.slug.message as string}</p>
                    : <p className="mt-1 text-xs text-muted-foreground">Auto-generated from the first text field</p>}
                </div>

                {/* Status + Locale */}
                <div className="mb-4 grid grid-cols-2 gap-4 items-start">
                  <div>
                    <Label className="mb-1.5 block">Status</Label>
                    <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Production (Published)</SelectItem>
                        <SelectItem value="staging">Staging (QA)</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="pending_review">Pending Review</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">Staging and Published entries are accessible via their respective environment targets</p>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Locale</Label>
                    <Select value={locale} onValueChange={(v) => { if (v !== null) setLocale(v); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">🇬🇧 en</SelectItem>
                        <SelectItem value="fr">🇫🇷 fr</SelectItem>
                        <SelectItem value="de">🇩🇪 de</SelectItem>
                        <SelectItem value="es">🇪🇸 es</SelectItem>
                        <SelectItem value="it">🇮🇹 it</SelectItem>
                        <SelectItem value="pt">🇧🇷 pt</SelectItem>
                        <SelectItem value="ja">🇯🇵 ja</SelectItem>
                        <SelectItem value="zh">🇨🇳 zh</SelectItem>
                        <SelectItem value="ar">🇸🇦 ar</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">BCP 47 language code</p>
                  </div>
                </div>

                {selectedCT.schema.length > 0 && (
                  <>
                    <div className="pt-6 pb-2">
                      <span className="text-base font-semibold text-foreground">Fields</span>
                      <Separator className="mt-2 bg-foreground/15" />
                    </div>
                    <div className="pt-1">
                      {selectedCT.schema.map((field) => (
                        <DynamicFormField key={field.name} field={field} control={control} register={register} errors={errors} watch={watch} />
                      ))}
                    </div>
                  </>
                )}

                {/* SEO Panel */}
                <div className="mt-6">
                  <div className="pt-3 pb-2 mb-1">
                    <span className="text-base font-semibold text-foreground">SEO</span>
                    <Separator className="mt-2 bg-foreground/15" />
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
              publishAt: null,
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
                    <div className="flex items-center gap-3">
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
                        title="Copy JSON"
                      >
                        {jsonCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {jsonCopied ? 'Copied' : 'Copy'}
                      </button>
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
