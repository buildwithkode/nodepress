import sanitizeHtml from 'sanitize-html';
import { FieldDef, RepeaterFieldDef, FlexibleFieldDef } from '../fields/field.types';

/** Tags and attributes allowed in richtext output */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'p', 'a', 'ul', 'ol', 'li',
  'b', 'strong', 'i', 'em', 's', 'strike', 'code', 'pre',
  'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption', 'mark', 'sub', 'sup',
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  '*': ['class'],
};

/** Strip all XSS vectors from a richtext HTML string */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto'],
    // Force external links to open safely
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      }),
    },
  });
}

/**
 * Walk entry data against its schema and sanitize all richtext fields.
 * Handles nested richtext inside repeater and flexible fields.
 */
export function sanitizeEntryData(
  data: Record<string, any>,
  schema: FieldDef[],
): Record<string, any> {
  const result = { ...data };

  for (const field of schema) {
    const val = result[field.name];
    if (val === undefined || val === null) continue;

    if (field.type === 'richtext' && typeof val === 'string') {
      result[field.name] = sanitizeRichText(val);
    } else if (field.type === 'repeater' && Array.isArray(val)) {
      const subFields = (field as RepeaterFieldDef).options?.subFields ?? [];
      result[field.name] = val.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeEntryData(item as Record<string, any>, subFields)
          : item,
      );
    } else if (field.type === 'flexible' && Array.isArray(val)) {
      const layouts = (field as FlexibleFieldDef).options?.layouts ?? [];
      result[field.name] = val.map((item) => {
        if (typeof item !== 'object' || item === null || !item._layout) return item;
        const layout = layouts.find((l) => l.name === item._layout);
        if (!layout) return item;
        return sanitizeEntryData(item as Record<string, any>, layout.fields);
      });
    }
  }

  return result;
}
