'use client';

import { ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import { FieldCondition, hiddenFields } from '@/lib/field-condition';

interface Props {
  control: any;
  /** The field this wraps, and the fields next to it (same level) */
  name: string;
  fields: { name: string; condition?: FieldCondition }[];
  /** Form path of the sibling values: '' for top-level fields, else e.g. `links.0` */
  path: string;
  children: ReactNode;
}

/** Renders a field only while its `condition` holds for the sibling values. */
export function ConditionalField({ control, name, fields, path, children }: Props) {
  // Without a name useWatch returns every form value — the top-level siblings.
  const values = (useWatch as (opts: any) => unknown)(path ? { control, name: path } : { control }) as Record<string, unknown> | undefined;
  return hiddenFields(fields, values ?? {}).has(name) ? null : <>{children}</>;
}

/** Wrap only fields that have a condition, so the rest don't re-render on every keystroke. */
export function withCondition(
  field: { name: string; condition?: FieldCondition },
  props: Omit<Props, 'name' | 'children'>,
  node: ReactNode,
) {
  return field.condition ? (
    <ConditionalField key={field.name} name={field.name} {...props}>{node}</ConditionalField>
  ) : node;
}
