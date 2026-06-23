'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, Braces, Copy, Check, PanelRight, Search, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
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
  const ctId = Number(searchParams?.get('ct') ?? 0);

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedCT, setSelectedCT] = useState<ContentType | null>(null);
  const [loadingCT, setLoadingCT] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'published' | 'draft' | 'archived'>('published');
  const [locale, setLocale] = useState('en');
  // SEO fields
  const [seoOpen, setSeoOpen] = useState(false);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(true);
  const [jsonCopied, setJsonCopied] = useState(false);
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
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/entries')}>
        <ArrowLeft className="h-4 w-4" /> Back to Entries
      </Button>

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
              <form id="entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-1">
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
                <div className="mb-4 flex items-start gap-4 flex-wrap">
                  <div>
                    <Label className="mb-1.5 block">Status</Label>
                    <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="pending_review">Pending Review</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">Only published entries appear in the public API</p>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Locale</Label>
                    <Select value={locale} onValueChange={(v) => { if (v !== null) setLocale(v); }}>
                      <SelectTrigger className="w-32">
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
                    <div className="flex items-center gap-3 py-1">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">Fields</span>
                      <Separator className="flex-1" />
                    </div>
                    <div className="pt-1">
                      {selectedCT.schema.map((field) => (
                        <DynamicFormField key={field.name} field={field} control={control} register={register} errors={errors} watch={watch} />
                      ))}
                    </div>
                  </>
                )}

                {/* SEO Panel */}
                <div className="mt-4">
                  <div className="flex items-center gap-3 py-1 mb-1">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground">SEO</span>
                    <Separator className="flex-1" />
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
                  <pre className="overflow-auto max-h-[75vh] p-3 rounded-md border border-border bg-muted/20 text-[11px] leading-relaxed text-foreground font-mono whitespace-pre">{jsonStr}</pre>
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
