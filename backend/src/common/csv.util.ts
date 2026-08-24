/**
 * RFC 4180 compliant CSV serialization and parsing utilities for NodePress.
 */

/**
 * Escapes a cell value according to RFC 4180 rules:
 * Wraps in quotes and escapes internal double-quotes if it contains commas, newlines, or quotes.
 */
export function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of NodePress entry objects into an RFC 4180 CSV string.
 *
 * @param entries - Array of entries (with slug, locale, status, publishAt, data)
 * @param schema - Content type schema FieldDef[]
 */
export function entriesToCsv(entries: any[], schema: Array<{ name: string; label?: string }>): string {
  const customFields = schema.map((f) => f.name);
  const headers = ['slug', 'locale', 'status', 'publishAt', ...customFields];

  const lines: string[] = [headers.join(',')];

  for (const entry of entries) {
    const data = (entry && entry.data) || {};
    const row = [
      escapeCsvCell(entry.slug),
      escapeCsvCell(entry.locale || 'en'),
      escapeCsvCell(entry.status || 'draft'),
      escapeCsvCell(entry.publishAt ? new Date(entry.publishAt).toISOString() : ''),
      ...customFields.map((fieldKey) => escapeCsvCell(data[fieldKey])),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

/**
 * Parse an RFC 4180 CSV string into a 2D matrix of strings.
 */
export function parseCsvRows(csvText: string): string[][] {
  if (!csvText || typeof csvText !== 'string') return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped double-quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(currentCell);
      if (currentRow.length > 0 && currentRow.some((c) => c.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some((c) => c.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parse an RFC 4180 CSV string into an array of raw entry objects.
 * Handles multiline quoted strings, escaped quotes, numeric/boolean auto-coercion, and JSON cells.
 */
export function parseCsvToEntries(
  csvText: string,
): Array<{ slug: string; locale?: string; status?: string; publishAt?: string; data: Record<string, any> }> {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];

  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^"|"$/g, ''));
  const entries: Array<{ slug: string; locale?: string; status?: string; publishAt?: string; data: Record<string, any> }> = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length === 0 || values.every((v) => !v.trim())) continue;

    let slug = '';
    let locale = 'en';
    let status = 'draft';
    let publishAt: string | undefined;
    const data: Record<string, any> = {};

    headers.forEach((header, index) => {
      const rawVal = values[index] ?? '';
      let val: any = rawVal;

      const trimmed = typeof rawVal === 'string' ? rawVal.trim() : rawVal;

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { val = JSON.parse(trimmed); } catch {}
      } else if (trimmed.toLowerCase() === 'true') {
        val = true;
      } else if (trimmed.toLowerCase() === 'false') {
        val = false;
      } else if (trimmed !== '' && !isNaN(Number(trimmed)) && !header.includes('slug') && !header.includes('name') && !header.includes('title')) {
        val = Number(trimmed);
      }

      if (header === 'slug') slug = String(val).trim();
      else if (header === 'locale') locale = String(val).trim() || 'en';
      else if (header === 'status') status = String(val).trim() || 'draft';
      else if (header === 'publishat' || header === 'publish_at') publishAt = rawVal ? String(rawVal) : undefined;
      else if (header) data[header] = val;
    });

    if (slug || Object.keys(data).length > 0) {
      entries.push({
        slug: slug || `imported-entry-${i}`,
        locale,
        status,
        publishAt,
        data,
      });
    }
  }

  return entries;
}
