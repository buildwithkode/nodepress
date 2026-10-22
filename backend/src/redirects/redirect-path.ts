import { BadRequestException } from '@nestjs/common';

/** Status codes a redirect may answer with. 410 = gone (no target). */
export const REDIRECT_STATUS_CODES = [301, 302, 307, 308, 410] as const;
export type RedirectStatus = (typeof REDIRECT_STATUS_CODES)[number];

/** Longest path or URL stored on either side. */
export const REDIRECT_MAX_LENGTH = 2048;

/** A→B→C is a chain of 2 hops; anything longer than this is refused at write time. */
export const MAX_CHAIN_HOPS = 5;

/**
 * Normalize the source path of a redirect — the key it is stored and looked up by.
 *
 * - Path only: an absolute URL ("https://old.site/a?b=1") keeps just "/a?b=1",
 *   and a #fragment is dropped (browsers never send it).
 * - Leading slash, repeated slashes collapsed, no trailing slash (except "/").
 * - The path is lowercased, so /About and /about are one redirect. The query
 *   string keeps its case and is only part of the key when it is written out:
 *   "/a" matches /a?anything, "/a?ref=x" matches only that exact query.
 */
export function normalizeFrom(input: unknown): string {
  if (typeof input !== 'string') throw new BadRequestException('"from" must be a path such as /old-page');
  let value = input.trim();
  if (!value) throw new BadRequestException('"from" is required');
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.pathname + url.search;
    } catch {
      throw new BadRequestException(`"from" is not a valid URL: ${input}`);
    }
  }
  const { path, query } = splitPath(value.replace(/#.*$/, ''), '"from"');
  const key = path.toLowerCase() + (query ? `?${query}` : '');
  if (key.length > REDIRECT_MAX_LENGTH) throw new BadRequestException(`"from" must be at most ${REDIRECT_MAX_LENGTH} characters`);
  return key;
}

/**
 * Normalize a redirect target: an absolute http(s) URL (kept as written) or a
 * path on this site (slashes tidied like `from`, case and query kept). A 410
 * has no target, so it is always stored as ''.
 */
export function normalizeTo(input: unknown, statusCode: number): string {
  if (statusCode === 410) return '';
  if (typeof input !== 'string' || !input.trim()) {
    throw new BadRequestException('"to" is required (a path such as /new-page or an http(s) URL) unless the status is 410');
  }
  const value = input.trim();
  if (value.length > REDIRECT_MAX_LENGTH) throw new BadRequestException(`"to" must be at most ${REDIRECT_MAX_LENGTH} characters`);
  // Protocol-relative ("//host", "/\\host" in browsers) would leave the site.
  if (/^[/\\]{2}/.test(value)) throw new BadRequestException('"to" must be a path or an http(s) URL');
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(`"to" is not a valid URL: ${value}`);
    }
    // javascript:, data:, mailto:… — only plain web links.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('"to" must be a path or an http(s) URL');
    }
    if (/\s/.test(value)) throw new BadRequestException('"to" must not contain spaces');
    return value;
  }
  const hash = value.indexOf('#');
  const fragment = hash >= 0 ? value.slice(hash) : '';
  const { path, query } = splitPath(hash >= 0 ? value.slice(0, hash) : value, '"to"');
  return path + (query ? `?${query}` : '') + fragment;
}

/** The lookup key a path target would match as a `from`, or null for an external URL / 410. */
export function targetKey(to: string): string | null {
  if (!to || !to.startsWith('/')) return null;
  return normalizeFrom(to);
}

export function assertStatus(value: unknown): RedirectStatus {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!REDIRECT_STATUS_CODES.includes(n as RedirectStatus)) {
    throw new BadRequestException(`status must be one of ${REDIRECT_STATUS_CODES.join(', ')}`);
  }
  return n as RedirectStatus;
}

function splitPath(value: string, label: string): { path: string; query: string } {
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) throw new BadRequestException(`${label} must not contain spaces, backslashes or control characters`);
  const q = value.indexOf('?');
  let path = q >= 0 ? value.slice(0, q) : value;
  const query = q >= 0 ? value.slice(q + 1) : '';
  path = ('/' + path).replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return { path, query };
}

// ─── Loops and chains ────────────────────────────────────────────────────────

export interface RedirectEdge {
  from: string;
  to: string;
}

/**
 * Check the redirects `changed` (by `from`) against the whole set `edges`
 * (which already contains them). Returns one problem per offending redirect,
 * empty when every chain through them is loop-free and at most MAX_CHAIN_HOPS long.
 */
export function findChainProblems(edges: RedirectEdge[], changed: string[]): Map<string, string> {
  const next = new Map<string, string>();
  const prev = new Map<string, string[]>();
  for (const e of edges) {
    const key = targetKey(e.to);
    if (!key) continue;
    next.set(e.from, key);
    const list = prev.get(key);
    if (list) list.push(e.from);
    else prev.set(key, [e.from]);
  }

  const problems = new Map<string, string>();
  for (const from of changed) {
    // Forward: follow the targets until one isn't redirected any more.
    const seen = new Set<string>([from]);
    let hops = 0;
    let node = from;
    let loop = false;
    while (next.has(node)) {
      node = next.get(node)!;
      hops++;
      if (seen.has(node)) { loop = true; break; }
      seen.add(node);
      if (hops > MAX_CHAIN_HOPS) break;
    }
    if (loop) {
      problems.set(from, node === from && hops === 1
        ? `${from} redirects to itself`
        : `${from} would create a redirect loop (${[...seen, node].join(' → ')})`);
      continue;
    }
    // Backward: the longest chain of redirects that ends at `from`.
    const incoming = longestIncoming(from, prev, MAX_CHAIN_HOPS + 1);
    if (hops + incoming > MAX_CHAIN_HOPS) {
      problems.set(from, `${from} would be part of a chain of ${hops + incoming} redirects (at most ${MAX_CHAIN_HOPS}) — point the redirects straight at the final page`);
    }
  }
  return problems;
}

function longestIncoming(node: string, prev: Map<string, string[]>, cap: number, depth = 0, seen = new Set<string>()): number {
  if (depth >= cap || seen.has(node)) return 0;
  seen.add(node);
  let best = 0;
  for (const p of prev.get(node) ?? []) {
    best = Math.max(best, 1 + longestIncoming(p, prev, cap, depth + 1, seen));
    if (best >= cap) break;
  }
  seen.delete(node);
  return best;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export interface CsvRedirectRow {
  line: number;
  from: string;
  to: string;
  status: string;
}

/**
 * Parse `from,to,status` rows (RFC 4180 quoting; comma or semicolon). A first
 * row naming the columns is a header and may put them in any order; extra
 * columns (such as `hits` in an export) are ignored. Blank lines are skipped.
 */
export function parseRedirectCsv(text: string): CsvRedirectRow[] {
  const records = parseCsv(text.replace(/^﻿/, ''));
  if (!records.length) return [];
  let cols = { from: 0, to: 1, status: 2 };
  let start = 0;
  const header = records[0].cells.map((c) => c.trim().toLowerCase());
  if (header.includes('from')) {
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    cols = { from: idx(['from', 'source']), to: idx(['to', 'target', 'destination']), status: idx(['status', 'statuscode', 'status_code', 'code', 'type']) };
    if (cols.to < 0) throw new BadRequestException('The CSV header has a "from" column but no "to" column');
    start = 1;
  }
  const rows: CsvRedirectRow[] = [];
  for (const r of records.slice(start)) {
    if (r.cells.every((c) => !c.trim())) continue;
    const cell = (i: number) => (i >= 0 ? (r.cells[i] ?? '').trim() : '');
    rows.push({ line: r.line, from: cell(cols.from), to: cell(cols.to), status: cell(cols.status) });
  }
  return rows;
}

function parseCsv(text: string): Array<{ line: number; cells: string[] }> {
  const delimiter = detectDelimiter(text);
  const out: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && !cell.trim()) {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell);
      out.push({ line: rowLine, cells });
      cells = [];
      cell = '';
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new BadRequestException(`Unclosed quote in the CSV starting on line ${rowLine}`);
  if (cell || cells.length) {
    cells.push(cell);
    out.push({ line: rowLine, cells });
  }
  return out;
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  return !first.includes(',') && first.includes(';') ? ';' : ',';
}

/** One CSV cell, quoted when needed. A leading =, +, - or @ is prefixed so spreadsheets don't run it as a formula. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
