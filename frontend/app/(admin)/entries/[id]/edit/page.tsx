'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronRight, Search, CloudIcon, Eye, Copy, Check, ThumbsUp, Undo2, History, RotateCcw, Loader2 } from 'lucide-react';
import { useAutosave } from '@/lib/useAutosave';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import DynamicFormField from '../../DynamicFormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Field { name: string; type: string; options?: any }
interface ContentType { id: number; name: string; schema: Field[] }
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

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/entries')}>
        <ArrowLeft className="h-4 w-4" /> Back to Entries
      </Button>

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
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Edit Entry{contentType ? ` — ${contentType.name}` : ''}</CardTitle>
              <CardDescription>Slug is locked after creation. Change status to control visibility.</CardDescription>
            </div>
            {autosaveStatus !== 'idle' && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 shrink-0">
                <CloudIcon className="h-3.5 w-3.5" />
                {autosaveStatus === 'saving' ? 'Saving…' : 'Saved'}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <form id="entry-form" onSubmit={handleSubmit(onSubmit)} className="space-y-1">
            {/* Slug (locked) */}
            <div className="mb-4">
              <Label htmlFor="slug" className="mb-1.5 block">Slug</Label>
              <Input
                id="slug"
                disabled
                {...register('slug')}
                className="cursor-not-allowed opacity-60"
              />
              <p className="mt-1 text-xs text-muted-foreground">Slug cannot be changed after creation</p>
            </div>

            {/* Status + Locale */}
            <div className="mb-4 flex items-start gap-4 flex-wrap">
              <div>
                <Label className="mb-1.5 block">Status</Label>
                <Select value={status} onValueChange={(v: string | null) => v && setStatus(v)}>
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
                <div className="flex items-center gap-3 py-1">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">Fields</span>
                  <Separator className="flex-1" />
                </div>
                <div className="pt-1">
                  {contentType.schema.map((field) => (
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
        </CardContent>

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
              <span className="text-muted-foreground shrink-0">Preview API:</span>
              <span className="truncate font-mono text-foreground flex-1">{previewUrl}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(previewUrl);
                  setPreviewCopied(true);
                  setTimeout(() => setPreviewCopied(false), 2000);
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy URL"
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
                  const base = window.location.origin;
                  const url = `${base}/api/${contentType.name}/${entry.slug}/preview?token=${res.data.token}`;
                  setPreviewUrl(url);
                  toast.success('Preview URL generated — valid for 1 hour');
                } catch {
                  toast.error('Failed to generate preview URL');
                }
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
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
