'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import FormBuilder, { FormField, ActionDef } from '../../_components/FormBuilder';

export default function EditFormPage() {
  const params = useParams();
  const id = params?.id as string;
  const [form, setForm]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/forms/${id}`)
      .then((res) => setForm(res.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!form) {
    return <p className="text-muted-foreground">Form not found.</p>;
  }

  // Convert stored select options (string[]) back to comma-separated string for the builder
  const fields: FormField[] = (form.fields as any[]).map((f) => ({
    ...f,
    options: Array.isArray(f.options) ? f.options.join(', ') : (f.options ?? ''),
  }));

  return (
    <FormBuilder
      mode="edit"
      formId={Number(id)}
      initialName={form.name}
      initialSlug={form.slug}
      initialFields={fields}
      initialActions={form.actions as ActionDef[]}
      initialActive={form.isActive}
      initialCaptchaEnabled={form.captchaEnabled ?? false}
    />
  );
}
