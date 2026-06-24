// Shared syntax highlighting for code previews across the admin.
// highlight.js core + a small registered language subset (keeps the bundle small),
// using the Atom One Dark token theme — the same one the docs page uses.
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/atom-one-dark.css';

const LANGS: Record<string, unknown> = { json, javascript, typescript, bash, xml };

for (const [name, lang] of Object.entries(LANGS)) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, lang as any);
}

/**
 * Return highlighted HTML for a code string. Pass a `language` for an exact
 * grammar, otherwise auto-detect across the registered subset. The result is
 * meant for `<code dangerouslySetInnerHTML>` — token colours come from the
 * imported Atom One Dark stylesheet (.hljs-* classes).
 */
export function highlightCode(code: string, language?: string): string {
  const src = code ?? '';
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(src, { language }).value;
  }
  return hljs.highlightAuto(src, Object.keys(LANGS)).value;
}
