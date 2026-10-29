import { XmlElement, XmlNode, XmlParseError, parseXml } from '../importer/xml';

/**
 * SVG uploads. An SVG is a document that can run script, so every SVG is
 * rebuilt from an allowlist before it is stored:
 *
 * - drawing, text, gradient, clip/mask, marker and filter elements only —
 *   no <script>, <foreignObject>, animation (which can set href), <feImage>,
 *   editor metadata (inkscape:…, sodipodi:…) or anything unknown; <a> is
 *   replaced by its children;
 * - no event handlers (on…), no namespaced attributes except xlink:href / xml:space;
 * - href only to "#id" (and raster data: URIs on <image>), url() only to "#id",
 *   no javascript:/data: anywhere else, no @import in <style>;
 * - parsed by the importer's XML parser: entity declarations are refused, so
 *   nothing is expanded or fetched.
 *
 * Uploads are served with a CSP that blocks scripts too (main.ts) — this is the
 * part that also covers S3 and other storage.
 */

export class SvgRejectedError extends Error {}

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'switch',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker', 'style',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
]);
/** Dropped, but their children are kept. */
const UNWRAP = new Set(['a']);
const NAMESPACED_ATTRS = new Set(['xlink:href', 'xml:space', 'xmlns:xlink']);
const RASTER_DATA = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]*$/i;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Does this file start like an SVG document (after a BOM, XML declaration, comments, DOCTYPE)? */
export function looksLikeSvg(head: Buffer | string): boolean {
  let s = (typeof head === 'string' ? head : head.toString('utf8')).replace(/^﻿/, '');
  for (;;) {
    s = s.trimStart();
    const m = /^(<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*>)/i.exec(s);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  return /^<svg[\s>/]/.test(s);
}

/** Every url(…) in a value points inside the document. */
const urlsAreLocal = (v: string) => [...v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].every((m) => m[2].startsWith('#'));
const squash = (v: string) => v.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();

function safeAttr(el: string, name: string, value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(name) || /^on/i.test(name)) return false;
  if (name.includes(':') && !NAMESPACED_ATTRS.has(name)) return false;
  if (name.startsWith('xmlns') && name !== 'xmlns' && name !== 'xmlns:xlink') return false;
  if (name === 'href' || name === 'xlink:href') {
    return value.trim().startsWith('#') || (el === 'image' && RASTER_DATA.test(value.trim()));
  }
  const flat = squash(value);
  if (/javascript:|vbscript:|data:|expression\(|@import|behavior:|-moz-binding/.test(flat)) return false;
  return urlsAreLocal(value);
}

/** CSS in <style>: imports and outside url()s removed. */
function safeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, _q, target: string) => (target.startsWith('#') ? whole : 'none'))
    .replace(/expression\s*\(|javascript:|-moz-binding|behavior\s*:/gi, '');
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

function serialize(el: XmlElement, out: string[], depth: number): void {
  if (depth > 64) return;
  // One namespace, set on the root: an inner xmlns could move elements out of SVG.
  const attrs = Object.entries(el.attrs).filter(([k, v]) => k !== 'xmlns' && (depth === 0 || k !== 'xmlns:xlink') && safeAttr(el.name, k, v));
  if (depth === 0) attrs.unshift(['xmlns', SVG_NS]);
  out.push(`<${el.name}${attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}>`);
  if (el.name === 'style') {
    out.push(escText(safeCss(el.children.filter((c): c is string => typeof c === 'string').join(''))));
  } else {
    children(el.children, out, depth);
  }
  out.push(`</${el.name}>`);
}

function children(nodes: XmlNode[], out: string[], depth: number): void {
  for (const c of nodes) {
    if (typeof c === 'string') out.push(escText(c));
    else if (ELEMENTS.has(c.name)) serialize(c, out, depth + 1);
    else if (UNWRAP.has(c.name)) children(c.children, out, depth + 1);
  }
}

/** Rebuild an SVG from the allowlist. Throws SvgRejectedError when it isn't a readable SVG. */
export function sanitizeSvg(input: string): string {
  // A DOCTYPE with only a public identifier (Illustrator's SVG 1.1 one) carries
  // nothing; one with an internal subset is left for the parser to refuse.
  const src = input.replace(/^﻿/, '').replace(/<!DOCTYPE[^>[]*>/i, '');
  let root: XmlElement;
  try {
    root = parseXml(src);
  } catch (err) {
    if (err instanceof XmlParseError) throw new SvgRejectedError(`Not a valid SVG: ${err.message}`);
    throw err;
  }
  if (root.name !== 'svg') throw new SvgRejectedError('Not a valid SVG: the root element is not <svg>');
  const out: string[] = [];
  serialize(root, out, 0);
  const svg = out.join('');
  // xlink:href needs its prefix declared, once, on the root.
  return svg.includes(' xlink:href="') && !/^<svg[^>]* xmlns:xlink="/.test(svg)
    ? svg.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"').replace(/^<svg xmlns:xlink="([^"]*)" xmlns="([^"]*)"/, '<svg xmlns="$2" xmlns:xlink="$1"')
    : svg;
}

/** Width and height in pixels, from the attributes or the viewBox. */
export function svgSize(svg: string): { width?: number; height?: number } {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const px = (v?: string) => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? Math.round(parseFloat(v)) || undefined : undefined);
  let width = px(attr('width'));
  let height = px(attr('height'));
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box.every(isFinite) && box[2] > 0 && box[3] > 0) {
    width ??= Math.round(box[2]);
    height ??= Math.round(box[3]);
  }
  return { width, height };
}
