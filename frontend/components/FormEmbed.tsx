'use client';

/**
 * <FormEmbed slug="contact-us" />
 *
 * Drop this anywhere in your Next.js app (or any React project).
 * It fetches the form schema from /api/forms/schema/:slug and renders
 * all fields dynamically. On submit it calls /api/submit/:slug.
 *
 * Props:
 *   slug           – matches the slug you set in the admin panel (required)
 *   onSuccess      – callback after successful submission (optional)
 *   className      – extra CSS class on the wrapper div (optional)
 *   submitLabel    – label on the submit button (default: "Send")
 *   successMessage – message shown on success (default: server message)
 */

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox';

interface FormField {
  name:     string;
  type:     FieldType;
  label:    string;
  required: boolean;
  options?: string[];
}

interface FormSchema {
  id:     number;
  name:   string;
  slug:   string;
  fields: FormField[];
}

interface FormEmbedProps {
  slug:           string;
  onSuccess?:     (submissionId: number) => void;
  className?:     string;
  submitLabel?:   string;
  successMessage?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FormEmbed({
  slug,
  onSuccess,
  className     = '',
  submitLabel   = 'Send',
  successMessage,
}: FormEmbedProps) {
  const [schema,  setSchema]  = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState('');
  const [values,  setValues]  = useState<Record<string, string | boolean>>({});
  const [errors,  setErrors]  = useState<string[]>([]);
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'submitting' | 'done' | 'error'>('loading');
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch schema on mount
  useEffect(() => {
    fetch(`/api/forms/schema/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Form "${slug}" not found`);
        return r.json();
      })
      .then((data: FormSchema) => {
        setSchema(data);
        // Init values
        const init: Record<string, string | boolean> = {};
        data.fields.forEach((f) => { init[f.name] = f.type === 'checkbox' ? false : ''; });
        setValues(init);
        setStatus('idle');
      })
      .catch((err) => {
        setSchemaError(err.message);
        setStatus('error');
      });
  }, [slug]);

  const setValue = (name: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schema) return;

    setErrors([]);
    setStatus('submitting');

    try {
      const res = await fetch(`/api/submit/${slug}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: values }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrors(json.errors ?? [json.message ?? 'Something went wrong']);
        setStatus('idle');
        return;
      }

      setSuccessMsg(successMessage ?? json.message ?? 'Thank you! Your submission has been received.');
      setStatus('done');
      onSuccess?.(json.submissionId);
    } catch {
      setErrors(['Network error. Please try again.']);
      setStatus('idle');
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className={`space-y-3 animate-pulse ${className}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-10 w-full rounded bg-muted" />
          </div>
        ))}
        <div className="h-10 w-28 rounded bg-muted" />
      </div>
    );
  }

  if (status === 'error' && schemaError) {
    return (
      <div className={`rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive ${className}`}>
        {schemaError}
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className={`rounded-md border border-emerald-500/30 bg-emerald-500/5 p-6 text-center ${className}`}>
        <p className="text-2xl mb-2">✓</p>
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{successMsg}</p>
      </div>
    );
  }

  if (!schema) return null;

  // ── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-destructive">{err}</p>
            ))}
          </div>
        )}

        {/* Fields */}
        {schema.fields.map((field) => (
          <FieldRenderer
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(v) => setValue(field.name, v)}
          />
        ))}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? 'Sending…' : submitLabel}
        </button>
      </form>
    </div>
  );
}

// ── Field renderer ────────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field:    FormField;
  value:    string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const inputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background ' +
    'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
    'disabled:cursor-not-allowed disabled:opacity-50';

  const label = (
    <label className="block text-sm font-medium text-foreground mb-1.5">
      {field.label}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );

  if (field.type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          name={field.name}
          required={field.required}
          rows={4}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-y min-h-[100px]`}
        />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        {label}
        <select
          name={field.name}
          required={field.required}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select an option…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'radio') {
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name={field.name}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="h-4 w-4 accent-primary"
                required={field.required && !value}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name={field.name}
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-sm text-foreground">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </span>
      </label>
    );
  }

  // text | email | number
  return (
    <div>
      {label}
      <input
        type={field.type}
        name={field.name}
        required={field.required}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}
