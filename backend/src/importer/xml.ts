/**
 * A small, non-validating XML parser for import files (WordPress WXR).
 *
 * Deliberately minimal and safe:
 * - elements, attributes, text, CDATA, comments and processing instructions;
 * - the five predefined entities (&lt; &gt; &amp; &quot; &apos;) and numeric
 *   character references (&#38; &#x26;). Any other `&name;` is kept as literal
 *   text — nothing is ever expanded from a DTD;
 * - a <!DOCTYPE> with an internal subset or ENTITY/SYSTEM/PUBLIC declarations is
 *   rejected outright (XXE, billion laughs), a bare `<!DOCTYPE name>` is skipped;
 * - input size and nesting depth are capped.
 *
 * Element and attribute names are kept as written, prefix included
 * ("wp:post_type"); namespaces are not resolved.
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export interface XmlParseOptions {
  /** Maximum input length in characters (default 50 MB). */
  maxLength?: number;
  /** Maximum element nesting depth (default 256). */
  maxDepth?: number;
}

export class XmlParseError extends Error {
  constructor(message: string, readonly position?: number) {
    super(position === undefined ? message : `${message} (at offset ${position})`);
    this.name = 'XmlParseError';
  }
}

export const XML_DEFAULT_MAX_LENGTH = 50 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 256;

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;
const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decode the predefined entities and numeric references in text or an attribute value. */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      // Not a legal XML character (NUL, surrogates, out of range) → keep it as written.
      if (!isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return String.fromCodePoint(code);
    }
    return PREDEFINED[ref] ?? whole; // unknown named entity: never expanded
  });
}

/** Parse a document and return its root element. Throws XmlParseError. */
export function parseXml(input: string, options: XmlParseOptions = {}): XmlElement {
  const maxLength = options.maxLength ?? XML_DEFAULT_MAX_LENGTH;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (typeof input !== 'string') throw new XmlParseError('Input must be a string');
  if (input.length > maxLength) throw new XmlParseError(`Document is larger than the ${maxLength}-character limit`);

  let src = input;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM

  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = 0;
  const len = src.length;

  const pushText = (text: string) => {
    if (!text) return;
    const parent = stack[stack.length - 1];
    if (!parent) {
      if (text.trim()) throw new XmlParseError('Text outside the root element', i);
      return;
    }
    const last = parent.children[parent.children.length - 1];
    // Merge adjacent text (e.g. text + CDATA) into one node.
    if (typeof last === 'string') parent.children[parent.children.length - 1] = last + text;
    else parent.children.push(text);
  };

  while (i < len) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      pushText(decodeEntities(src.slice(i)));
      break;
    }
    if (lt > i) pushText(decodeEntities(src.slice(i, lt)));
    i = lt;

    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) throw new XmlParseError('Unterminated CDATA section', i);
      if (!stack.length) throw new XmlParseError('CDATA outside the root element', i);
      pushText(src.slice(i + 9, end));
      i = end + 3;
    } else if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) throw new XmlParseError('Unterminated comment', i);
      i = end + 3;
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) throw new XmlParseError('Unterminated processing instruction', i);
      i = end + 2;
    } else if (src.startsWith('<!DOCTYPE', i) || src.startsWith('<!doctype', i)) {
      i = skipDoctype(src, i);
    } else if (src.startsWith('<!', i)) {
      throw new XmlParseError('Unsupported markup declaration', i);
    } else if (src[i + 1] === '/') {
      // End tag
      const gt = src.indexOf('>', i + 2);
      if (gt === -1) throw new XmlParseError('Unterminated end tag', i);
      const name = src.slice(i + 2, gt).trim();
      const open = stack.pop();
      if (!open) throw new XmlParseError(`Unexpected end tag </${name}>`, i);
      if (open.name !== name) throw new XmlParseError(`Mismatched end tag </${name}>, expected </${open.name}>`, i);
      i = gt + 1;
    } else {
      // Start tag
      let j = i + 1;
      if (j >= len || !NAME_START.test(src[j])) throw new XmlParseError('Invalid tag name', i);
      while (j < len && NAME_CHAR.test(src[j])) j++;
      const el: XmlElement = { name: src.slice(i + 1, j), attrs: {}, children: [] };
      let selfClosing = false;

      for (;;) {
        while (j < len && isSpace(src.charCodeAt(j))) j++;
        if (j >= len) throw new XmlParseError(`Unterminated start tag <${el.name}>`, i);
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClosing = true; j += 2; break; }

        const nameStart = j;
        if (!NAME_START.test(src[j])) throw new XmlParseError(`Invalid attribute in <${el.name}>`, j);
        while (j < len && NAME_CHAR.test(src[j])) j++;
        const attr = src.slice(nameStart, j);
        while (j < len && isSpace(src.charCodeAt(j))) j++;
        if (src[j] !== '=') throw new XmlParseError(`Attribute "${attr}" has no value`, j);
        j++;
        while (j < len && isSpace(src.charCodeAt(j))) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") throw new XmlParseError(`Attribute "${attr}" value must be quoted`, j);
        const close = src.indexOf(quote, j + 1);
        if (close === -1) throw new XmlParseError(`Unterminated value for attribute "${attr}"`, j);
        const raw = src.slice(j + 1, close);
        if (raw.includes('<')) throw new XmlParseError(`"<" in the value of attribute "${attr}"`, j);
        if (Object.prototype.hasOwnProperty.call(el.attrs, attr)) throw new XmlParseError(`Duplicate attribute "${attr}"`, nameStart);
        el.attrs[attr] = decodeEntities(raw);
        j = close + 1;
      }

      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) throw new XmlParseError('More than one root element', i);
      else root = el;

      if (!selfClosing) {
        stack.push(el);
        if (stack.length > maxDepth) throw new XmlParseError(`Elements nested deeper than ${maxDepth}`, i);
      }
      i = j;
    }
  }

  if (stack.length) throw new XmlParseError(`Unclosed element <${stack[stack.length - 1].name}>`);
  if (!root) throw new XmlParseError('No root element');
  return root;
}

/**
 * Skip `<!DOCTYPE name>`. Anything that could declare or pull in entities — an
 * internal subset `[...]`, ENTITY, SYSTEM or PUBLIC — is refused.
 */
function skipDoctype(src: string, start: number): number {
  const gt = src.indexOf('>', start);
  if (gt === -1) throw new XmlParseError('Unterminated DOCTYPE', start);
  const decl = src.slice(start, gt + 1);
  if (/\[|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/i.test(decl)) {
    throw new XmlParseError('DOCTYPE declarations with entities or external references are not allowed', start);
  }
  return gt + 1;
}

function isSpace(c: number) {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

// ── Helpers for walking a parsed tree ──────────────────────────────────────

/** Direct child elements, optionally only those named `name`. */
export function childElements(el: XmlElement, name?: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of el.children) if (typeof c !== 'string' && (name === undefined || c.name === name)) out.push(c);
  return out;
}

/** The first direct child element named `name`. */
export function firstChild(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== 'string' && c.name === name) return c;
  return undefined;
}

/** All text inside an element (descendants included), untrimmed. */
export function textContent(el: XmlElement | undefined): string {
  if (!el) return '';
  let out = '';
  for (const c of el.children) out += typeof c === 'string' ? c : textContent(c);
  return out;
}

/** Trimmed text of the first child named `name` ('' when missing). */
export function childText(el: XmlElement | undefined, name: string): string {
  return textContent(firstChild(el, name)).trim();
}
