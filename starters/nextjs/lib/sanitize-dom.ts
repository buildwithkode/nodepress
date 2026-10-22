// Browser-side sanitizer for live preview data (the editor's unsaved HTML).
// Uses the browser's own HTML parser and an allowlist, so it has no dependencies.

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'th', 'thead', 'tr', 'u', 'ul',
]);
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'name', 'target'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};
/** Dropped together with their content. */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form']);
const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeInBrowser(html: string | undefined): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) {
        child.remove();
        continue;
      }
      walk(child);
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes)); // keep the text, lose the tag
        continue;
      }
      const allowed = new Set([...(ALLOWED_ATTRS[tag] ?? []), 'class']);
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (!allowed.has(name) || ((name === 'href' || name === 'src') && !SAFE_URL.test(attr.value.trim()))) {
          child.removeAttribute(attr.name);
        }
      }
      if (tag === 'a') child.setAttribute('rel', 'noopener noreferrer');
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
