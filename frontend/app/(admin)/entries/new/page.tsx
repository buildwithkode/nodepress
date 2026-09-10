'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Braces,
  Copy,
  Check,
  PanelRight,
  Search,
  ChevronDown,
  ChevronRight,
  WrapText,
  Rocket,
  Globe,
  Shield,
  Settings,
  Sparkles,
  Layers,
  FileText,
  Clock,
  Eye,
} from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Field {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: any;
}

interface ContentType {
  id: number;
  name: string;
  displayName?: string | null;
  schema: Field[];
}

function classifySchemaFields(schema: Field[]) {
  const titleField =
    schema.find(
      (f) =>
        (f.type === 'text' || f.type === 'string') &&
        ['title', 'name', 'headline', 'post_title', 'product_name', 'article_title'].includes(f.name.toLowerCase()),
    ) ||
    schema.find((f) => f.type === 'text' && (f.name.toLowerCase().includes('title') || f.name.toLowerCase().includes('name'))) ||
    schema.find((f) => f.type === 'text');

  const mainTypes = ['richtext', 'textarea', 'repeater', 'flexible', 'group'];
  const sidebarTypes = ['image', 'number', 'boolean', 'select', 'color', 'date', 'datetime', 'relation'];

  const mainFields: Field[] = [];
  const sidebarFields: Field[] = [];

  schema.forEach((f) => {
    if (titleField && f.name === titleField.name) {
      return;
    }

    if (mainTypes.includes(f.type)) {
      mainFields.push(f);
    } else if (sidebarTypes.includes(f.type)) {
      sidebarFields.push(f);
    } else {
      const lower = f.name.toLowerCase();
      if (['category', 'author', 'read_time', 'tags', 'sku', 'brand', 'badge', 'type'].some((kw) => lower.includes(kw))) {
        sidebarFields.push(f);
      } else {
        mainFields.push(f);
      }
    }
  });

  return { titleField, mainFields, sidebarFields };
}

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

  // Inspector mode / tabs
  const [inspectorTab, setInspectorTab] = useState<'document' | 'json'>('document');
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);

  const slugManualRef = useRef(false);

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

  const { titleField, mainFields, sidebarFields } = selectedCT
    ? classifySchemaFields(selectedCT.schema)
    : { titleField: undefined, mainFields: [], sidebarFields: [] };

  useEffect(() => {
    if (!titleField) return;
    const sub = watch((values, { name }) => {
      if (!name) return;
      if (name === 'slug') { slugManualRef.current = true; return; }
      if (slugManualRef.current) return;
      if (name === titleField.name) setValue('slug', toSlug(values[titleField.name] || ''), { shouldValidate: false });
    });
    return () => sub.unsubscribe();
  }, [titleField, watch, setValue]);

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
      await api.post('/entries', {
        contentTypeId: selectedCT.id,
        slug,
        locale,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
      });
      toast.success('Entry created successfully');
      router.push(selectedCT ? `/entries?ct=${selectedCT.name}` : '/entries');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCT) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto p-4">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="space-y-4 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent></Card>
      </div>
    );
  }

  // Generate live JSON for developer inspector
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
    contentTypeId: selectedCT?.id,
    data: fieldData,
    seo: hasSeo ? previewSeo : null,
  };
  const jsonStr = JSON.stringify(liveJson, null, 2);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(selectedCT ? `/entries?ct=${selectedCT.name}` : '/entries')}
          >
            <ArrowLeft className="h-4 w-4" /> Back to {selectedCT ? ctLabel(selectedCT) : 'Entries'}
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Universal CMS Workspace
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedCT && isAdmin && (
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
          )}
          <Button
            type="submit"
            form="entry-form"
            disabled={submitting || !selectedCT}
            className="h-8 gap-1.5 font-semibold text-xs shadow-sm"
          >
            {submitting ? 'Creating…' : 'Create Entry'}
          </Button>
        </div>
      </div>

      {/* Content Type Selector (if not preselected via URL) */}
      {!ctId && (
        <Card className="border-border/70 bg-card/40">
          <CardContent className="pt-4">
            <div className="max-w-md space-y-1.5">
              <Label className="text-xs font-semibold">Select Collection / Content Type</Label>
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
                  <SelectValue placeholder="Choose a content type (Blog Posts, Store Products, etc.)…" />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes.map((ct) => (
                    <SelectItem key={ct.id} value={String(ct.id)}>{ctLabel(ct)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedCT ? (
        <form id="entry-form" onSubmit={handleSubmit(onSubmit)}>
          {/* Universal 2-Column Responsive Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ── Left Column: Primary Editorial Canvas (approx 68% / 8 cols) ── */}
            <div className="lg:col-span-8 space-y-6">
              <Card className="border-border/80 bg-card shadow-sm p-6 sm:p-8">
                {/* Hero Title Headline */}
                {titleField ? (
                  <div className="mb-6 space-y-1">
                    <Input
                      placeholder={`Add ${titleField.label || toLabel(titleField.name)}…`}
                      {...register(titleField.name, {
                        required: titleField.required ? `${titleField.label || titleField.name} is required` : false,
                      })}
                      className={cn(
                        'text-2xl sm:text-3xl font-extrabold border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40 tracking-tight transition-all',
                        errors[titleField.name] && 'border-b border-destructive',
                      )}
                    />
                    {errors[titleField.name] && (
                      <p className="text-xs text-destructive">{errors[titleField.name]?.message as string}</p>
                    )}
                  </div>
                ) : (
                  <h2 className="text-2xl font-bold tracking-tight mb-4">
                    New {selectedCT.displayName || ctLabel(selectedCT)}
                  </h2>
                )}

                {/* Primary Content Fields (Rich Text, Repeaters, Flexible Blocks, Textareas) */}
                {mainFields.length > 0 ? (
                  <div className="space-y-6 pt-2">
                    {mainFields.map((field) => (
                      <div key={field.name} className="space-y-2">
                        <DynamicFormField
                          field={field}
                          control={control}
                          register={register}
                          errors={errors}
                          watch={watch}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  !titleField && (
                    <p className="text-xs text-muted-foreground italic py-4">
                      No primary content fields configured. Add fields in the sidebar.
                    </p>
                  )
                )}
              </Card>
            </div>

            {/* ── Right Column: Document Settings Inspector (approx 32% / 4 cols) ── */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
              {/* Tab Switcher: Document Settings vs Live JSON */}
              <div className="flex items-center justify-between bg-muted/40 p-1 rounded-xl border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setInspectorTab('document')}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5',
                    inspectorTab === 'document'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Document Settings
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('json')}
                  className={cn(
                    'py-1.5 px-3 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5',
                    inspectorTab === 'json'
                      ? 'bg-background text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Braces className="h-3.5 w-3.5" />
                  JSON
                </button>
              </div>

              {inspectorTab === 'document' ? (
                <>
                  {/* Card 1: Status, Pipeline & Target Environment */}
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Rocket className="h-3.5 w-3.5 text-purple-400" />
                          Publishing & Status
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-mono px-2 py-0.5 capitalize',
                            status === 'published' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
                            status === 'staging' && 'border-purple-500/50 bg-purple-500/10 text-purple-400',
                            status === 'pending_review' && 'border-blue-500/50 bg-blue-500/10 text-blue-400',
                            status === 'draft' && 'border-amber-500/50 bg-amber-500/10 text-amber-400',
                          )}
                        >
                          {status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3.5">
                      {/* Target Stage Buttons */}
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { key: 'draft', label: 'Draft' },
                          { key: 'pending_review', label: 'Review' },
                          { key: 'staging', label: 'Staging' },
                          { key: 'published', label: 'Prod' },
                        ].map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setStatus(s.key)}
                            className={cn(
                              'py-1.5 px-1 rounded text-[11px] font-medium border text-center transition-all',
                              status === s.key
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      {/* Slug field */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <Label htmlFor="slug" className="text-xs font-medium">Permalink Slug</Label>
                          <span className="text-[10px] text-muted-foreground font-mono">/{selectedCT.name}/...</span>
                        </div>
                        <Input
                          id="slug"
                          placeholder="my-entry-slug"
                          {...register('slug', {
                            required: 'Slug is required',
                            pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Lowercase, numbers and hyphens only' },
                          })}
                          onChange={(e) => {
                            slugManualRef.current = true;
                            register('slug').onChange(e);
                          }}
                          className={cn('h-8 text-xs font-mono', errors.slug && 'border-destructive')}
                        />
                        {errors.slug && (
                          <p className="text-[11px] text-destructive">{errors.slug.message as string}</p>
                        )}
                      </div>

                      {/* Locale */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Language / Locale</Label>
                        <Select value={locale} onValueChange={(v) => { if (v !== null) setLocale(v); }}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">🇬🇧 English (en)</SelectItem>
                            <SelectItem value="fr">🇫🇷 French (fr)</SelectItem>
                            <SelectItem value="de">🇩🇪 German (de)</SelectItem>
                            <SelectItem value="es">🇪🇸 Spanish (es)</SelectItem>
                            <SelectItem value="it">🇮🇹 Italian (it)</SelectItem>
                            <SelectItem value="pt">🇧🇷 Portuguese (pt)</SelectItem>
                            <SelectItem value="ja">🇯🇵 Japanese (ja)</SelectItem>
                            <SelectItem value="zh">🇨🇳 Chinese (zh)</SelectItem>
                            <SelectItem value="ar">🇸🇦 Arabic (ar)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Sidebar Metadata & Attributes */}
                  {sidebarFields.length > 0 && (
                    <Card className="border-border/80 shadow-sm">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-blue-400" />
                          Document Attributes & Media
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-4">
                        {sidebarFields.map((field) => (
                          <div key={field.name} className="space-y-1.5">
                            <DynamicFormField
                              field={field}
                              control={control}
                              register={register}
                              errors={errors}
                              watch={watch}
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Card 3: SEO & Social Search Card */}
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setSeoOpen((v) => !v)}
                        className="flex items-center justify-between w-full text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Search className="h-3.5 w-3.5 text-emerald-400" />
                          Search Engine (SEO)
                        </span>
                        {seoOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </CardHeader>
                    {seoOpen && (
                      <CardContent className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50">
                        <div className="space-y-1">
                          <Label htmlFor="seo-title" className="text-xs font-medium">Meta Title</Label>
                          <Input
                            id="seo-title"
                            placeholder="Custom Google title..."
                            value={seoTitle}
                            onChange={(e) => setSeoTitle(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="seo-desc" className="text-xs font-medium">Meta Description</Label>
                          <Input
                            id="seo-desc"
                            placeholder="Brief search snippet summary..."
                            value={seoDescription}
                            onChange={(e) => setSeoDescription(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="seo-img" className="text-xs font-medium">OG Image URL</Label>
                          <Input
                            id="seo-img"
                            placeholder="https://.../social-card.jpg"
                            value={seoImage}
                            onChange={(e) => setSeoImage(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={seoNoIndex}
                            onChange={(e) => setSeoNoIndex(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border border-input"
                          />
                          <span>Exclude from search engines (noindex)</span>
                        </label>
                      </CardContent>
                    )}
                  </Card>
                </>
              ) : (
                /* Live JSON Developer View */
                <Card className="border-border/80 shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Braces className="h-3.5 w-3.5 text-primary" /> Live Payload
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setJsonWrap((w) => !w)}
                          className={cn('text-[11px] flex items-center gap-1', jsonWrap ? 'text-primary' : 'text-muted-foreground')}
                        >
                          <WrapText className="h-3 w-3" /> Wrap
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(jsonStr);
                            setJsonCopied(true);
                            setTimeout(() => setJsonCopied(false), 2000);
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          {jsonCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          {jsonCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3">
                    <pre className="overflow-auto max-h-[70vh] p-3 rounded-lg bg-muted/30 text-[11px] font-mono leading-relaxed text-foreground border border-border/50">
                      <code dangerouslySetInnerHTML={{ __html: highlightCode(jsonStr, 'json') }} />
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </form>
      ) : (
        <Card className="py-12 text-center text-muted-foreground">
          <p className="text-sm">Please select a collection or content type above to start authoring.</p>
        </Card>
      )}
    </div>
  );
}
