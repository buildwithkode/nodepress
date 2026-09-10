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

interface Field { name: string; type: string; options?: any; label?: string }
interface ContentType { id: number; name: string; displayName?: string | null; schema: Field[] }
interface Entry {
  id: number;
  slug: string;
  status: string;
  contentTypeId: number;
  data: Record<string, any>;
  seo?: { title?: string; description?: string; image?: string; noIndex?: boolean } | null;
  publishAt?: string | null;
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

  // Side-by-side Multilingual Translation Workspace
  const [rightTab, setRightTab] = useState<'json' | 'translate'>('json');
  const [baseLocale, setBaseLocale] = useState('en');
  const [baseEntry, setBaseEntry] = useState<Entry | null>(null);
  const [loadingBase, setLoadingBase] = useState(false);

  // JSON preview split pane
  const [jsonOpen, setJsonOpen] = useState(true);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonWrap, setJsonWrap] = useState(true);
  const [leftPct, setLeftPct] = useState(58);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => setAutosaveStatus('idle'), 2000);
    } catch {
      setAutosaveStatus('idle');
    }
  }, [entry, getValues, status, seoTitle, seoDescription, seoImage, seoNoIndex, publishAt]);

  useAutosave(
    JSON.stringify({ watchedValues, status, seoTitle, seoDescription, seoImage, seoNoIndex, publishAt }),
    autosaveFn,
    3000,      // 3-second debounce
    !loading,  // only autosave after entry is fully loaded
  );

  useEffect(() => {
    api.get(`/entries/${id}`)
      .then(async (res) => {
        const e: Entry = res.data;
        setEntry(e);
        setStatus(e.status ?? 'published');
        setLocale((e as any).locale ?? 'en');
        setSeoTitle(e.seo?.title ?? '');
        setSeoDescription(e.seo?.description ?? '');
        setSeoImage(e.seo?.image ?? '');
        setSeoNoIndex(e.seo?.noIndex ?? false);
        setPublishAt(e.publishAt ? new Date(e.publishAt).toISOString().slice(0, 16) : '');
        const ctRes = await api.get(`/content-types/${e.contentTypeId}`);
        setContentType(ctRes.data);
        reset({ slug: e.slug, ...e.data });
      })
      .catch(() => { toast.error('Failed to load entry'); router.push('/entries'); })
      .finally(() => setLoading(false));
  }, [id]);

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
      toast.success('Entry updated');
      router.push('/entries');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const canApprove = me?.role === 'admin' || me?.role === 'editor';

  const handleApprove = async () => {
    if (!entry) return;
    setSubmitting(true);
    try {
      await api.put(`/entries/${entry.id}`, { status: 'published' });
      setStatus('published');
      setEntry((e) => e ? { ...e, status: 'published' } : e);
      toast.success('Entry approved and published');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToDraft = async () => {
    if (!entry) return;
    setSubmitting(true);
    try {
      await api.put(`/entries/${entry.id}`, { status: 'draft' });
      setStatus('draft');
      setEntry((e) => e ? { ...e, status: 'draft' } : e);
      toast.success('Entry returned to draft');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to return entry to draft');
    } finally {
      setSubmitting(false);
    }
  };

  const loadVersions = async () => {
    if (!entry) return;
    setVersionsLoading(true);
    try {
      const res = await api.get(`/entries/${entry.id}/versions`);
      setVersions(res.data ?? []);
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
      setStatus(restored.status ?? 'published');
      reset({ slug: restored.slug, ...restored.data });
      toast.success('Version restored');
      await loadVersions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to restore version');
    } finally {
      setRestoringVersion(null);
    }
  };

  const fetchBaseLocale = async (loc: string) => {
    if (!id) return;
    setLoadingBase(true);
    try {
      const res = await api.get(`/entries/${id}`, { params: { locale: loc } });
      setBaseEntry(res.data);
    } catch {
      setBaseEntry(entry);
    } finally {
      setLoadingBase(false);
    }
  };

  useEffect(() => {
    if (rightTab === 'translate' && id) {
      fetchBaseLocale(baseLocale);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, baseLocale, id]);

  const copyFieldsFromBase = () => {
    if (!baseEntry?.data) return;
    const currentVals = getValues();
    const updated = { ...currentVals };
    let copiedCount = 0;
    for (const [k, v] of Object.entries(baseEntry.data)) {
      if (updated[k] === undefined || updated[k] === null || updated[k] === '') {
        updated[k] = v;
        copiedCount++;
      }
    }
    reset(updated);
    toast.success(`Copied ${copiedCount} field(s) from ${baseLocale.toUpperCase()} reference`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Card><CardContent className="space-y-4 pt-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top breadcrumbs and active user presence */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push(contentType ? `/entries?ct=${contentType.name}` : '/entries')}>
          <ArrowLeft className="h-4 w-4" /> Back to {contentType ? ctLabel(contentType) : 'Entries'}
        </Button>

        <div className="flex items-center gap-2">
          {/* Active Presence Avatars */}
          {activeUsers.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card text-xs">
              <span className="relative flex h-2 w-2 mr-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] text-muted-foreground font-medium mr-1">
                {activeUsers.length} online
              </span>
              <div className="flex -space-x-1.5 overflow-hidden">
                {activeUsers.slice(0, 4).map((u) => (
                  <div
                    key={u.id || u.email}
                    title={`${u.email} (${u.role})`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white ring-2 ring-background uppercase"
                  >
                    {u.email.charAt(0)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {contentType && canManageSettings(me?.role) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => router.push(`/content-types/${contentType.id}/edit`)}
                title="Edit Content Type Schema"
              >
                <Settings className="h-3.5 w-3.5 text-indigo-400" />
                Edit Schema
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => router.push(`/users/permissions?tab=fields&ct=${contentType.name}`)}
                title="Configure Field-Level Permissions"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                Field Permissions
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Real-time Conflict Soft-Lock Banner */}
      {isLockedByOther && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>{lock?.email}</strong> is actively editing this entry. Simultaneous saves may conflict.
            </span>
          </div>
          {(me?.role === 'admin' || me?.role === 'editor') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 shrink-0"
              onClick={takeoverLock}
            >
              <Lock className="h-3 w-3" />
              Take Over Lock
            </Button>
          )}
        </div>
      )}

      {/* Pending review approval banner — shown to admins and editors only */}
      {status === 'pending_review' && canApprove && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <ThumbsUp className="h-4 w-4 shrink-0" />
            <span>This entry is awaiting review. Approve to publish it, or return to draft.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" disabled={submitting} onClick={handleReturnToDraft}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Return to Draft
            </Button>
            <Button size="sm" disabled={submitting} onClick={handleApprove}>
              <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
              Approve & Publish
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Edit Entry{contentType ? ` — ${ctLabel(contentType)}` : ''}</CardTitle>
              <CardDescription>Editing the slug changes the entry's public URL. Change status to control visibility.</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {autosaveStatus !== 'idle' && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                  <CloudIcon className="h-3.5 w-3.5" />
                  {autosaveStatus === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              )}

              {/* Status Selector */}
              <Select value={status} onValueChange={setStatus}>
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

              {/* Top Quick Save / Update Button */}
              <Button type="submit" form="entry-form" size="sm" className="h-8 text-xs font-medium gap-1.5" disabled={submitting}>
                {submitting ? 'Saving…' : status === 'published' ? 'Update' : 'Save'}
              </Button>

              <Button
                type="button"
                variant={rightTab === 'translate' && jsonOpen ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  if (!jsonOpen) setJsonOpen(true);
                  setRightTab(rightTab === 'translate' ? 'json' : 'translate');
                }}
                title="Side-by-side Multilingual Translation Workspace"
              >
                <Languages className="h-3.5 w-3.5 text-blue-400" />
                {rightTab === 'translate' && jsonOpen ? 'JSON View' : 'Translate'}
              </Button>
              <Button
                type="button"
                variant={jsonOpen ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setJsonOpen((v) => !v)}
              >
                <PanelRight className="h-3.5 w-3.5" />
                {jsonOpen ? 'Hide Panel' : 'Panel'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <div ref={containerRef} className="flex items-start border-t border-border">
          {/* Left pane: form */}
          <div style={{ width: jsonOpen ? `${leftPct}%` : '100%' }} className="min-w-0 px-6 py-4">
          <form id="entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Slug (editable — changing it breaks existing links/SEO) */}
            <div className="mb-4">
              <Label htmlFor="slug" className="mb-1.5 block">Slug</Label>
              <Input
                id="slug"
                {...register('slug', {
                  required: 'Slug is required',
                  pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Lowercase, numbers and hyphens only' },
                })}
                className={cn(errors.slug && 'border-destructive focus-visible:ring-destructive')}
              />
              {errors.slug
                ? <p className="mt-1 text-xs text-destructive">{errors.slug.message as string}</p>
                : <p className="mt-1 text-xs text-amber-500">Changing the slug breaks existing links and SEO pointing to the old URL.</p>}
            </div>

            {/* Status + Locale */}
            <div className="mb-4 grid grid-cols-2 gap-4 items-start">
              <div>
                <Label className="mb-1.5 block">Status</Label>
                <Select value={status} onValueChange={(v: string | null) => v && setStatus(v)}>
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

            {/* Scheduled publish */}
            {status === 'draft' && (
              <div className="mb-4 p-3 rounded-md border border-border bg-muted/30">
                <Label htmlFor="publishAt" className="mb-1.5 block text-sm">
                  Scheduled Publish
                </Label>
                <input
                  id="publishAt"
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Entry automatically publishes at this time. Leave empty to publish manually.
                </p>
              </div>
            )}

            {contentType && contentType.schema.length > 0 && (
              <>
                <div className="pt-6 pb-2">
                  <span className="text-base font-semibold text-foreground">Fields</span>
                  <Separator className="mt-2 bg-foreground/15" />
                </div>
                <div className="pt-1">
                  {contentType.schema.map((field) => (
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
          </div>

          {/* Drag handle */}
          {jsonOpen && (
            <div
              onMouseDown={onDragStart}
              className="relative w-px self-stretch shrink-0 cursor-col-resize group select-none bg-border hover:bg-primary/40 transition-colors"
            >
              <div className="absolute inset-y-0 -left-2 -right-2" />
            </div>
          )}

          {/* Right pane: Translation Workspace or JSON Preview */}
          {jsonOpen && (() => {
            if (rightTab === 'translate') {
              return (
                <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 border-l border-border bg-muted/10">
                  <div className="sticky top-4 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                      <div className="flex items-center gap-1.5">
                        <Languages className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-semibold">Reference Language</span>
                      </div>
                      <Select
                        value={baseLocale}
                        onValueChange={(val) => {
                          if (val) {
                            setBaseLocale(val);
                            fetchBaseLocale(val);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">EN (English)</SelectItem>
                          <SelectItem value="es">ES (Spanish)</SelectItem>
                          <SelectItem value="fr">FR (French)</SelectItem>
                          <SelectItem value="de">DE (German)</SelectItem>
                          <SelectItem value="zh">ZH (Chinese)</SelectItem>
                          <SelectItem value="ja">JA (Japanese)</SelectItem>
                          <SelectItem value="ar">AR (Arabic)</SelectItem>
                          <SelectItem value="pt">PT (Portuguese)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      onClick={copyFieldsFromBase}
                      disabled={loadingBase || !baseEntry}
                    >
                      <CopyCheck className="h-3.5 w-3.5" />
                      Copy Empty Fields from {baseLocale.toUpperCase()}
                    </Button>

                    {loadingBase ? (
                      <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        Loading {baseLocale.toUpperCase()} reference...
                      </div>
                    ) : !contentType?.schema ? (
                      <p className="text-xs text-muted-foreground">No schema fields</p>
                    ) : (
                      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                        <div className="rounded-md border border-border bg-card p-2.5">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                            <span className="font-semibold uppercase">Slug</span>
                            <span className="font-mono text-[10px]">core</span>
                          </div>
                          <p className="text-xs font-mono bg-muted/40 p-1.5 rounded text-foreground break-all">
                            {baseEntry?.slug || '—'}
                          </p>
                        </div>

                        {contentType.schema.map((field) => {
                          const val = baseEntry?.data?.[field.name];
                          const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '—');
                          return (
                            <div key={field.name} className="rounded-md border border-border bg-card p-2.5">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                <span className="font-semibold">{field.label || field.name}</span>
                                <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 uppercase">
                                  {field.type}
                                </Badge>
                              </div>
                              <div className="text-xs text-foreground bg-muted/40 p-2 rounded max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans">
                                {displayVal}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const { slug, ...fieldData } = watchedValues;
            const seo = {
              title: seoTitle.trim() || undefined,
              description: seoDescription.trim() || undefined,
              image: seoImage.trim() || undefined,
              noIndex: seoNoIndex || undefined,
            };
            const hasSeo = Object.values(seo).some((v) => v !== undefined);
            const liveJson = {
              id: entry?.id,
              slug: slug ?? entry?.slug,
              status,
              locale,
              contentTypeId: entry?.contentTypeId,
              data: fieldData,
              seo: hasSeo ? seo : null,
              publishAt: publishAt ? new Date(publishAt).toISOString() : null,
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

        {/* Version History Panel */}
        <div className="border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => {
              const next = !versionsOpen;
              setVersionsOpen(next);
              if (next && versions.length === 0) loadVersions();
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <History className="h-3.5 w-3.5" />
            <span>Version History</span>
            {versionsOpen
              ? <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              : <ChevronRight className="h-3.5 w-3.5 ml-auto" />
            }
          </button>

          {versionsOpen && (
            <div className="mt-3 space-y-1">
              {versionsLoading && (
                <p className="text-xs text-muted-foreground py-2">Loading…</p>
              )}
              {!versionsLoading && versions.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No versions yet — versions are created on each save.</p>
              )}
              {versions.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.createdBy && (
                      <span className="text-muted-foreground truncate">by {v.createdBy.email}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    disabled={restoringVersion === v.id}
                    onClick={() => handleRestoreVersion(v.id)}
                  >
                    {restoringVersion === v.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RotateCcw className="h-3 w-3" />
                    }
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <CardFooter className="justify-between gap-2 flex-wrap">
          {/* Preview URL panel */}
          {previewUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-medium">Draft View:</span>
              <span className="truncate font-mono text-foreground flex-1 min-w-0">{previewUrl}</span>
              <button
                type="button"
                onClick={() => {
                  window.open(previewUrl, '_blank');
                }}
                className="shrink-0 text-primary hover:underline flex items-center gap-1 font-medium px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + previewUrl);
                  setPreviewCopied(true);
                  setTimeout(() => setPreviewCopied(false), 2000);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Copy Preview URL"
              >
                {previewCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!entry}
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
            <Button variant="outline" onClick={() => router.push('/entries')}>Cancel</Button>
            <Button type="submit" form="entry-form" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
