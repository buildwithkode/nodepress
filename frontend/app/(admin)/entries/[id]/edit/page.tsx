'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  CloudIcon,
  Eye,
  Copy,
  Check,
  ThumbsUp,
  Undo2,
  History,
  RotateCcw,
  Loader2,
  Braces,
  PanelRight,
  WrapText,
  ExternalLink,
  Rocket,
  Globe,
  Sparkles,
  Shield,
  Settings,
  Users,
  Lock,
  Unlock,
  AlertTriangle,
  Languages,
  CopyCheck,
  Layers,
  FileText,
  Clock,
} from 'lucide-react';
import { useAutosave } from '@/lib/useAutosave';
import { useEntryPresence } from '@/lib/useEntryPresence';
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
import DynamicFormField from '../../DynamicFormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Field {
  name: string;
  type: string;
  options?: any;
  label?: string;
  required?: boolean;
}

interface ContentType {
  id: number;
  name: string;
  displayName?: string | null;
  schema: Field[];
}

interface Entry {
  id: number;
  slug: string;
  status: string;
  contentTypeId: number;
  data: Record<string, any>;
  seo?: { title?: string; description?: string; image?: string; noIndex?: boolean } | null;
  publishAt?: string | null;
}

function toLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams() ?? {};
  const id = (params.id ?? '') as string;
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [status, setStatus] = useState<string>('published');
  const [locale, setLocale] = useState<string>('en');
  const [seoOpen, setSeoOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);

  // Real-time Collaborative Presence & Soft-Locking
  const {
    activeUsers,
    lock,
    isLockedByOther,
    hasLock,
    takeoverLock,
  } = useEntryPresence(id ? parseInt(id, 10) : null, me?.id);

  // Inspector mode tabs: 'document' | 'translate' | 'json'
  const [rightTab, setRightTab] = useState<'document' | 'translate' | 'json'>('document');
  const [baseLocale, setBaseLocale] = useState('en');
  const [baseEntry, setBaseEntry] = useState<Entry | null>(null);
  const [loadingBase, setLoadingBase] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);

  // Version history
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // SEO fields
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [publishAt, setPublishAt] = useState('');

  const { register, control, handleSubmit, reset, watch, getValues, formState: { errors } } = useForm<Record<string, any>>();

  // ── Autosave ──────────────────────────────────────────────────────────────
  const watchedValues = watch();

  const autosaveFn = useCallback(async () => {
    if (!entry) return;
    setAutosaveStatus('saving');
    try {
      const values = getValues();
      const { slug, ...rest } = values;
      const seo = {
        title: seoTitle.trim() || undefined,
        description: seoDescription.trim() || undefined,
        image: seoImage.trim() || undefined,
        noIndex: seoNoIndex || undefined,
      };
      const hasSeo = Object.values(seo).some((v) => v !== undefined);
      await api.put(`/entries/${entry.id}`, {
        slug,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      });
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('idle');
    }
  }, [entry, getValues, seoTitle, seoDescription, seoImage, seoNoIndex, status, publishAt]);
  useAutosave(watchedValues, autosaveFn, 2500);

  // ── Load entry & content-type ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/entries/${id}`)
      .then(async (res) => {
        const ent: Entry = res.data;
        setEntry(ent);
        setStatus(ent.status);
        if ((ent as any).locale) setLocale((ent as any).locale);
        if (ent.seo) {
          setSeoTitle(ent.seo.title || '');
          setSeoDescription(ent.seo.description || '');
          setSeoImage(ent.seo.image || '');
          setSeoNoIndex(!!ent.seo.noIndex);
        }
        if (ent.publishAt) {
          const d = new Date(ent.publishAt);
          setPublishAt(d.toISOString().slice(0, 16));
        }
        reset({ slug: ent.slug, ...(ent.data || {}) });

        const ctRes = await api.get(`/content-types/${ent.contentTypeId}`);
        setContentType(ctRes.data);
      })
      .catch(() => toast.error('Failed to load entry'))
      .finally(() => setLoading(false));
  }, [id, reset]);

  const { titleField, mainFields, sidebarFields } = contentType
    ? classifySchemaFields(contentType.schema)
    : { titleField: undefined, mainFields: [], sidebarFields: [] };

  const loadVersions = async () => {
    if (!entry) return;
    setVersionsLoading(true);
    try {
      const res = await api.get(`/entries/${entry.id}/versions`);
      setVersions(res.data);
    } catch {
      toast.error('Failed to load version history');
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!entry) return;
    setRestoringVersion(versionId);
    try {
      const res = await api.post(`/entries/${entry.id}/versions/${versionId}/restore`);
      const restored = res.data;
      setEntry(restored);
      reset({ slug: restored.slug, ...(restored.data || {}) });
      toast.success('Version restored');
      setVersionsOpen(false);
    } catch {
      toast.error('Failed to restore version');
    } finally {
      setRestoringVersion(null);
    }
  };

  const fetchBaseLocale = async (targetLocale: string) => {
    if (!entry || !contentType) return;
    setLoadingBase(true);
    try {
      const res = await api.get(`/entries`, {
        params: {
          contentTypeId: contentType.id,
          slug: entry.slug,
          locale: targetLocale,
        },
      });
      const items = res.data.data ?? res.data;
      if (Array.isArray(items) && items.length > 0) {
        setBaseEntry(items[0]);
      } else {
        setBaseEntry(null);
        toast.info(`No reference content found for locale "${targetLocale}"`);
      }
    } catch {
      toast.error('Failed to load reference locale');
    } finally {
      setLoadingBase(false);
    }
  };

  const copyFieldsFromBase = () => {
    if (!baseEntry?.data) return;
    const currentValues = getValues();
    let copiedCount = 0;
    Object.keys(baseEntry.data).forEach((k) => {
      if (!currentValues[k] || currentValues[k] === '') {
        reset((prev) => ({ ...prev, [k]: baseEntry.data[k] }));
        copiedCount++;
      }
    });
    toast.success(`Copied ${copiedCount} empty fields from ${baseLocale.toUpperCase()}`);
  };

  const onSubmit = async (values: Record<string, any>) => {
    if (!entry) return;
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

      await api.put(`/entries/${entry.id}`, {
        slug,
        status,
        data: rest,
        seo: hasSeo ? seo : null,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      });
      toast.success('Entry saved successfully');
      router.push('/entries');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto p-4">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="space-y-4 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent></Card>
      </div>
    );
  }

  // Live JSON for inspector
  const { slug: formSlug, ...formData } = watchedValues;
  const liveJson = {
    id: entry?.id,
    slug: formSlug ?? entry?.slug,
    status,
    locale,
    contentTypeId: entry?.contentTypeId,
    data: formData,
    seo: (seoTitle || seoDescription || seoImage || seoNoIndex) ? {
      title: seoTitle || undefined,
      description: seoDescription || undefined,
      image: seoImage || undefined,
      noIndex: seoNoIndex || undefined,
    } : null,
    publishAt: publishAt ? new Date(publishAt).toISOString() : null,
  };
  const jsonStr = JSON.stringify(liveJson, null, 2);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* Soft Lock / Presence Banner */}
      {isLockedByOther && lock && (
        <div className="flex items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-xs">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              <strong>{lock.email}</strong> is currently editing this entry.
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/20"
            onClick={takeoverLock}
          >
            Take Over Lock
          </Button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(contentType ? `/entries?ct=${contentType.name}` : '/entries')}
          >
            <ArrowLeft className="h-4 w-4" /> Back to {contentType ? ctLabel(contentType) : 'Entries'}
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {contentType ? ctLabel(contentType) : 'Entry'} Editor
          </span>
          {autosaveStatus !== 'idle' && (
            <Badge variant="outline" className="text-[10px] gap-1 font-mono">
              <CloudIcon className="h-3 w-3 text-muted-foreground" />
              {autosaveStatus === 'saving' ? 'Saving…' : 'Autosaved'}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {contentType && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
              onClick={() => window.open(`/${contentType.name}/${entry?.slug}`, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Live Post ↗
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={async () => {
              if (!entry || !contentType) return;
              try {
                const res = await api.post(`/entries/${entry.id}/preview-url`);
                const draftUrl = `/api/draft?secret=${encodeURIComponent(res.data.token)}&slug=${encodeURIComponent(entry.slug)}&type=${encodeURIComponent(contentType.name)}`;
                setPreviewUrl(draftUrl);
                window.open(draftUrl, '_blank');
                toast.success('Live preview mode launched in new tab');
              } catch {
                toast.error('Failed to generate preview URL');
              }
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            Live Preview
          </Button>

          <Button
            type="submit"
            form="entry-form"
            disabled={submitting}
            className="h-8 gap-1.5 font-semibold text-xs shadow-sm"
          >
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

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
                  {entry?.slug || 'Edit Entry'}
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

            {/* Version History Drawer Panel */}
            <Card className="border-border/80 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const next = !versionsOpen;
                  setVersionsOpen(next);
                  if (next && versions.length === 0) loadVersions();
                }}
                className="flex items-center justify-between w-full p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Version History & Snapshots
                </span>
                {versionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              {versionsOpen && (
                <div className="p-4 border-t border-border/60 bg-muted/10 space-y-2">
                  {versionsLoading && <p className="text-xs text-muted-foreground py-2">Loading snapshots…</p>}
                  {!versionsLoading && versions.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">No past versions yet. Snapshots are created on every save.</p>
                  )}
                  {versions.map((v: any) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/50 bg-card hover:bg-muted/40 transition-colors text-xs"
                    >
                      <div>
                        <p className="font-semibold text-foreground m-0">{new Date(v.createdAt).toLocaleString()}</p>
                        {v.createdBy && <p className="text-[11px] text-muted-foreground m-0">Saved by {v.createdBy.email}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={restoringVersion === v.id}
                        onClick={() => handleRestoreVersion(v.id)}
                      >
                        {restoringVersion === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Right Column: Document Settings Inspector (approx 32% / 4 cols) ── */}
          <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
            {/* Inspector Tab Switcher */}
            <div className="flex items-center justify-between bg-muted/40 p-1 rounded-xl border border-border/60 text-xs">
              <button
                type="button"
                onClick={() => setRightTab('document')}
                className={cn(
                  'flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1',
                  rightTab === 'document' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightTab('translate');
                  if (!baseEntry) fetchBaseLocale(baseLocale);
                }}
                className={cn(
                  'flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1',
                  rightTab === 'translate' ? 'bg-background text-blue-400 shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Languages className="h-3.5 w-3.5" />
                Translate
              </button>
              <button
                type="button"
                onClick={() => setRightTab('json')}
                className={cn(
                  'py-1.5 px-2.5 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1',
                  rightTab === 'json' ? 'bg-background text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Braces className="h-3.5 w-3.5" />
                JSON
              </button>
            </div>

            {rightTab === 'document' && (
              <>
                {/* Card 1: Status & Pipeline */}
                <Card className="border-border/80 shadow-sm">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Rocket className="h-3.5 w-3.5 text-purple-400" />
                        Status & Environment
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
                    {/* Stage Pipeline Buttons */}
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

                    {/* Slug */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <Label htmlFor="slug" className="text-xs font-medium">Permalink Slug</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">/{contentType?.name}/...</span>
                      </div>
                      <Input
                        id="slug"
                        {...register('slug', {
                          required: 'Slug is required',
                          pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Lowercase, numbers and hyphens only' },
                        })}
                        className={cn('h-8 text-xs font-mono', errors.slug && 'border-destructive')}
                      />
                      {errors.slug && (
                        <p className="text-[11px] text-destructive">{errors.slug.message as string}</p>
                      )}
                    </div>

                    {/* Locale & Scheduled Publish */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Locale</Label>
                        <Select value={locale} onValueChange={(v) => { if (v !== null) setLocale(v); }}>
                          <SelectTrigger className="w-full h-8 text-xs font-mono">
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
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Schedule</Label>
                        <input
                          type="datetime-local"
                          value={publishAt}
                          onChange={(e) => setPublishAt(e.target.value)}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-xs"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card 2: Sidebar Attributes & Media */}
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
            )}

            {rightTab === 'translate' && (
              /* Multilingual Reference Workspace */
              <Card className="border-border/80 shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5 text-blue-400" /> Reference ({baseLocale.toUpperCase()})
                    </span>
                    <Select
                      value={baseLocale}
                      onValueChange={(val) => {
                        if (val) {
                          setBaseLocale(val);
                          fetchBaseLocale(val);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">EN</SelectItem>
                        <SelectItem value="es">ES</SelectItem>
                        <SelectItem value="fr">FR</SelectItem>
                        <SelectItem value="de">DE</SelectItem>
                        <SelectItem value="zh">ZH</SelectItem>
                        <SelectItem value="ja">JA</SelectItem>
                        <SelectItem value="ar">AR</SelectItem>
                        <SelectItem value="pt">PT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    onClick={copyFieldsFromBase}
                    disabled={loadingBase || !baseEntry}
                  >
                    <CopyCheck className="h-3.5 w-3.5" />
                    Copy Empty Fields from {baseLocale.toUpperCase()}
                  </Button>

                  {loadingBase ? (
                    <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                      Loading reference...
                    </div>
                  ) : !contentType?.schema ? (
                    <p className="text-xs text-muted-foreground">No schema fields</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                      {contentType.schema.map((field) => {
                        const val = baseEntry?.data?.[field.name];
                        const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '—');
                        return (
                          <div key={field.name} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 uppercase font-semibold">
                              <span>{field.label || field.name}</span>
                              <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
                                {field.type}
                              </Badge>
                            </div>
                            <div className="text-xs text-foreground bg-card p-2 rounded max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans border border-border/50">
                              {displayVal}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {rightTab === 'json' && (
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
    </div>
  );
}
