'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronRight, Search } from 'lucide-react';
import api from '@/lib/axios';
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [status, setStatus] = useState<string>('published');
  const [seoOpen, setSeoOpen] = useState(false);

  // SEO fields
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoImage, setSeoImage] = useState('');
  const [seoNoIndex, setSeoNoIndex] = useState(false);
  const [publishAt, setPublishAt] = useState('');

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<Record<string, any>>();

  useEffect(() => {
    api.get(`/entries/${id}`)
      .then(async (res) => {
        const e: Entry = res.data;
        setEntry(e);
        setStatus(e.status ?? 'published');
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

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/entries')}>
        <ArrowLeft className="h-4 w-4" /> Back to Entries
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Entry{contentType ? ` — ${contentType.name}` : ''}</CardTitle>
          <CardDescription>Slug is locked after creation. Change status to control visibility.</CardDescription>
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

            {/* Status */}
            <div className="mb-4">
              <Label className="mb-1.5 block">Status</Label>
              <Select value={status} onValueChange={(v: string | null) => v && setStatus(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Only published entries appear in the public API</p>
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

        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/entries')}>Cancel</Button>
          <Button type="submit" form="entry-form" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
