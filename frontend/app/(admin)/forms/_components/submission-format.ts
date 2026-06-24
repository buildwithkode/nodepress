// Shared helpers for rendering + exporting form submissions that may contain
// nested objects / arrays (Phase 3). Used by the submissions viewer + CSV export.

export interface CsvField {
  name: string;
  label?: string;
  type?: string;
  fields?: CsvField[];
}

const humanize = (k: string) =>
  k.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Compact one-line string for a value — used in table summary cells. */
export function summarize(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) {
    const allScalar = v.every((x) => x === null || typeof x !== 'object');
    return allScalar ? v.map((x) => String(x ?? '')).join(', ') : `${v.length} item${v.length === 1 ? '' : 's'}`;
  }
  if (typeof v === 'object') return Object.keys(v as object).length ? '{…}' : '';
  return String(v);
}

/** Scalar/array → plain string for a CSV cell (objects/arrays-of-objects → JSON). */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    const allScalar = v.every((x) => x === null || typeof x !== 'object');
    return allScalar ? v.map((x) => String(x ?? '')).join('; ') : JSON.stringify(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Column { header: string; get: (data: Record<string, unknown>) => string }

/** Build CSV columns from the form schema: group → dot columns, repeater → one JSON column. */
function buildColumns(fields: CsvField[] | undefined, rows: { data: Record<string, unknown> }[]): Column[] {
  const cols: Column[] = [];
  if (fields && fields.length) {
    for (const f of fields) {
      const label = f.label || humanize(f.name);
      if (f.type === 'group' && f.fields?.length) {
        for (const sub of f.fields) {
          const subLabel = sub.label || humanize(sub.name);
          cols.push({
            header: `${label} / ${subLabel}`,
            get: (d) => cell(((d[f.name] as Record<string, unknown>) ?? {})?.[sub.name]),
          });
        }
      } else {
        cols.push({ header: label, get: (d) => cell(d[f.name]) });
      }
    }
  } else {
    // No schema — derive columns from the union of keys across rows.
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));
    for (const k of keys) cols.push({ header: humanize(k), get: (d) => cell(d[k]) });
  }
  return cols;
}

/** Serialize submissions to a CSV string. Always appends a "Submitted At" column. */
export function toCsv(
  fields: CsvField[] | undefined,
  rows: { data: Record<string, unknown>; createdAt: string }[],
): string {
  const cols = buildColumns(fields, rows);
  const header = [...cols.map((c) => c.header), 'Submitted At'].map(csvEscape).join(',');
  const lines = rows.map((r) =>
    [...cols.map((c) => c.get(r.data)), new Date(r.createdAt).toISOString()].map(csvEscape).join(','),
  );
  return [header, ...lines].join('\n');
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
