'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
interface ContentType { id: number; name: string; schema: Field[] }

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
  const slugManualRef = useRef(false);

  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<Record<string, any>>();

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
      await api.post('/entries', { contentTypeId: selectedCT.id, slug, locale, status, data: rest });
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
          <CardTitle>New Entry{selectedCT ? ` — ${selectedCT.name}` : ''}</CardTitle>
          <CardDescription>Fill in the fields below to create a new entry.</CardDescription>
        </CardHeader>

        <CardContent>
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
                    <SelectItem key={ct.id} value={String(ct.id)}>{ct.name}</SelectItem>
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
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">Only published entries appear in the public API</p>
                </div>
                <div>
                  <Label className="mb-1.5 block">Locale</Label>
                  <Select value={locale} onValueChange={setLocale}>
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
            </form>
          )}

          {!selectedCT && ctId === 0 && (
            <p className="text-sm text-muted-foreground py-4">Select a content type to begin.</p>
          )}
        </CardContent>

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
