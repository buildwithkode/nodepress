'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import DynamicFormField from '../../DynamicFormField';

interface Field { name: string; type: string; options?: any }
interface ContentType { id: number; name: string; schema: Field[] }
interface Entry { id: number; slug: string; contentTypeId: number; data: Record<string, any> }

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams() ?? {};
  const id = (params.id ?? '') as string;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);

  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<Record<string, any>>();

  useEffect(() => {
    api.get(`/entries/${id}`)
      .then(async (res) => {
        const e: Entry = res.data;
        setEntry(e);
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
      await api.put(`/entries/${entry.id}`, { slug, data: rest });
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
          <CardDescription>Slug cannot be changed after creation.</CardDescription>
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
