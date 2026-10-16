import { parse } from 'qs';

/**
 * Query-string parser for nested params like `?where[price][gt]=10`.
 *
 * Express 5 defaults to the "simple" parser, which leaves `where[price][gt]`
 * as one flat key — so every `where` / `filters` / `filter` query was silently
 * ignored and returned unfiltered results. Express's own "extended" setting
 * enables `allowPrototypes`; this keeps qs's safe defaults and caps nesting and
 * size so a crafted query string can't build huge objects.
 */
export function parseQueryString(str: string): Record<string, unknown> {
  return parse(str, {
    depth: 5,             // where[OR][0][field][op] needs 4
    arrayLimit: 100,      // larger indexes become object keys, not sparse arrays
    parameterLimit: 1000,
  });
}
