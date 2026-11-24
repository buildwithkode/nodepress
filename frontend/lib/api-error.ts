interface SchemaField {
  name: string;
  type: string;
  label?: string;
  options?: { subFields?: SchemaField[]; layouts?: { name: string; label?: string; fields?: SchemaField[] }[] };
}

const words = (name: string) => name.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * A validation error from the API (`sections[1].items[3].category: "x" is not a valid choice (…)`)
 * with its path in the content type's labels: `Sections #2 (FAQ) › Items #4 › Category: …`.
 * Without a schema, or for a path it can't follow, the names are only made readable.
 */
export function describeFieldError(error: string, schema?: SchemaField[], data?: unknown): string {
  const split = error.indexOf(': ');
  if (split < 0) return error;
  const path = error.slice(0, split);
  const reason = error.slice(split + 2);

  const parts: string[] = [];
  let fields: SchemaField[] | undefined = schema;
  let field: SchemaField | undefined;
  let value: any = data;
  for (const [, name, index] of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (name !== undefined) {
      field = fields?.find((f) => f.name === name);
      parts.push(field?.label?.trim() || words(name));
      value = value?.[name];
      fields = field?.type === 'group' || field?.type === 'repeater' ? field.options?.subFields : undefined;
      if (field?.type === 'group') field = undefined;
    } else {
      const i = Number(index);
      const item = Array.isArray(value) ? value[i] : undefined;
      let label = `#${i + 1}`;
      if (field?.type === 'flexible') {
        const layout = field.options?.layouts?.find((l) => l.name === item?._layout);
        if (layout) label += ` (${layout.label?.trim() || words(layout.name)})`;
        fields = layout?.fields;
      }
      parts[parts.length - 1] = `${parts[parts.length - 1] ?? ''} ${label}`.trim();
      value = item;
      field = undefined;
    }
  }
  return `${parts.join(' › ')}: ${reason}`;
}

/**
 * What to show for a failed request: each reason the server gave (validation
 * errors, in the content type's labels when a schema is passed), else its
 * message, else `fallback`.
 */
export function apiErrorMessage(err: any, fallback: string, schema?: SchemaField[], data?: unknown): string {
  const body = err?.response?.data;
  const errors: unknown = body?.errors;
  if (Array.isArray(errors) && errors.length) {
    const lines = errors.filter((e): e is string => typeof e === 'string').map((e) => describeFieldError(e, schema, data));
    if (lines.length) return lines.join('\n');
  }
  const message = body?.message;
  if (Array.isArray(message)) return message.join('\n');
  return typeof message === 'string' && message ? message : fallback;
}
