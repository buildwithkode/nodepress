'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Inbox } from 'lucide-react';
import { FormEmbed } from '@/components/FormEmbed';
import { Button } from '@/components/ui/button';
import api from '@/lib/axios';

export default function FormTestPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const slug         = searchParams?.get('slug') ?? 'test-form';

  const [formId, setFormId] = useState<number | null>(null);

  // Resolve form id from slug so we can link to submissions
  useEffect(() => {
    api.get('/forms')
      .then((res) => {
        const match = res.data.find((f: any) => f.slug === slug);
        if (match) setFormId(match.id);
      })
      .catch(() => {});
  }, [slug]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push('/forms')}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Forms
        </Button>

        {formId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(`/forms/${formId}/submissions`)}
          >
            <Inbox className="h-3.5 w-3.5" /> View Submissions
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
        <strong>Live preview</strong> — submitting this form stores a real entry in the database.
        Click <strong>View Submissions</strong> after submitting to see it.
      </div>

      {/* Form embed */}
      <div className="rounded-xl border bg-card p-6">
        <FormEmbed
          slug={slug}
          submitLabel="Send Test Submission"
          successMessage="Saved! Click 'View Submissions' above to inspect the result."
        />
      </div>

      {/* Quick curl tip */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Or test with curl</p>
        <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all leading-5">
{`curl -X POST http://localhost:3000/api/submit/${slug} \\
  -H "Content-Type: application/json" \\
  -d '{"data":{"full_name":"Jane","email":"jane@test.com","message":"hello"}}'`}
        </pre>
      </div>
    </div>
  );
}
