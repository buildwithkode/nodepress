import type { WxrItem } from './wxr';
import { PhpValue, isSerializedPhp, unserializePhp } from './php';
import { decodeEntities } from './xml';
import { MAX_NESTING } from '../fields/schema.validator';

/**
 * Advanced Custom Fields → NodePress fields. Pure functions: no database.
 *
 * ACF keeps its field definitions as posts (`acf-field-group`, `acf-field`)
 * that the WordPress exporter includes, and stores values as flat post meta:
 *
 *   sections                    a:2:{i:0;s:4:"hero";i:1;s:5:"cards";}   ← flexible: layout per row
 *   sections_0_heading          "Hello"
 *   sections_1_cards            "2"                                     ← repeater: row count
 *   sections_1_cards_0_image    "274"                                   ← attachment ID
 *   _sections_0_heading         "field_hero_heading"                    ← which field a value belongs to
 *
 * The definitions say what every key means, so a field group becomes real
 * NodePress fields — flexible, repeater, group, image, select, relation… —
 * and the values nested data. What doesn't fit a NodePress field (unknown
 * field types, containers deeper than MAX_NESTING) is still converted to
 * structured JSON, so nothing is lost. Sites whose ACF fields live in theme
 * code (PHP or local JSON) have no definitions in the export: their meta is
 * structured from the key patterns instead (`structureMeta`).
 */

// ── Definitions ─────────────────────────────────────────────────────────────

export interface AcfField {
  id: number;
  key: string;                    // field_…
  name: string;                   // the meta key segment
  label: string;
  type: string;
  config: Record<string, any>;
  parent: number;                 // post ID of the group or parent field
  order: number;
  children: AcfField[];
}

export interface AcfGroup {
  id: number;
  key: string;                    // group_…
  title: string;
  fields: AcfField[];
  /** Post types the group's location rules show it on. */
  postTypes: string[];
  /** Options pages (menu slugs) it is shown on — their values are not in exports. */
  optionsPages: string[];
}

export interface AcfDefinitions {
  groups: AcfGroup[];
  fieldsByKey: Map<string, AcfField>;
  /** Field key → the group it belongs to (through its parents). */
  groupOfField: Map<string, AcfGroup>;
}

const PAGE_RULES = new Set(['page_template', 'page_type', 'page', 'page_parent']);
const POST_RULES = new Set(['post_template', 'post_category', 'post_format']);

const asRecord = (v: PhpValue | undefined): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};

/** Read the ACF field groups and fields from an export (empty when ACF isn't used). */
export function readAcfDefinitions(items: WxrItem[]): AcfDefinitions {
  const groups: AcfGroup[] = [];
  const groupsById = new Map<number, AcfGroup>();
  const fields: AcfField[] = [];
  for (const item of items) {
    if (item.status === 'trash') continue;
    if (item.postType === 'acf-field-group') {
      const config = asRecord(unserializePhp(item.content));
      const postTypes = new Set<string>();
      const optionsPages = new Set<string>();
      for (const branch of Array.isArray(config.location) ? config.location : []) {
        for (const rule of Array.isArray(branch) ? branch : []) {
          if (!rule || rule.operator !== '==' || typeof rule.value !== 'string') continue;
          if (rule.param === 'post_type') postTypes.add(rule.value);
          else if (PAGE_RULES.has(rule.param)) postTypes.add('page');
          else if (POST_RULES.has(rule.param)) postTypes.add('post');
          else if (rule.param === 'options_page') optionsPages.add(rule.value);
        }
      }
      const group: AcfGroup = {
        id: item.postId, key: item.postName, title: item.title || item.postName,
        fields: [], postTypes: [...postTypes], optionsPages: [...optionsPages],
      };
      groups.push(group);
      groupsById.set(group.id, group);
    } else if (item.postType === 'acf-field') {
      const config = asRecord(unserializePhp(item.content));
      fields.push({
        id: item.postId, key: item.postName, name: item.excerpt || item.postName, label: item.title,
        type: typeof config.type === 'string' ? config.type : 'text', config,
        parent: item.postParent, order: item.menuOrder, children: [],
      });
    }
  }

  const fieldsById = new Map(fields.map((f) => [f.id, f]));
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  for (const f of fields) {
    const parentField = fieldsById.get(f.parent);
    if (parentField) parentField.children.push(f);
    else groupsById.get(f.parent)?.fields.push(f);
  }
  const byOrder = (a: AcfField, b: AcfField) => a.order - b.order || a.id - b.id;
  for (const f of fields) f.children.sort(byOrder);
  for (const g of groups) g.fields.sort(byOrder);

  const groupOfField = new Map<string, AcfGroup>();
  for (const f of fields) {
    let cur: AcfField | undefined = f;
    const seen = new Set<number>();
    while (cur && fieldsById.has(cur.parent) && !seen.has(cur.id)) { seen.add(cur.id); cur = fieldsById.get(cur.parent); }
    const group = cur && groupsById.get(cur.parent);
    if (group) groupOfField.set(f.key, group);
  }
  return { groups, fieldsByKey, groupOfField };
}

/**
 * The groups that apply to items of a post type: by their location rules,
 * plus any group whose fields these items have values for (the `_name` meta
 * points at the field key) — location rules can be negations or conditions
 * this importer doesn't evaluate.
 */
export function groupsForPostType(defs: AcfDefinitions, postType: string, items: WxrItem[]): AcfGroup[] {
  const found = new Set(defs.groups.filter((g) => g.postTypes.includes(postType)));
  for (const item of items) {
    for (const [k, v] of Object.entries(item.meta)) {
      if (k.startsWith('_') && v.startsWith('field_')) {
        const g = defs.groupOfField.get(v);
        if (g) found.add(g);
      }
    }
  }
  return defs.groups.filter((g) => found.has(g));
}

// ── Fields ──────────────────────────────────────────────────────────────────

type Kind =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'boolean' | 'select' | 'image' | 'color'
  | 'date' | 'datetime' | 'json' | 'relation' | 'group' | 'repeater' | 'flexible';

interface Layout { name: string; acf: string; label: string; children: AcfNode[] }

/** One converted field: how it reads from meta and the NodePress field it becomes. */
export interface AcfNode {
  name: string;                   // NodePress field name
  acf: string;                    // meta key segment
  label: string;
  description?: string;
  acfType: string;
  kind: Kind;
  config: Record<string, any>;
  /** Container nested deeper than NodePress allows: its value is kept as JSON. */
  asJson?: boolean;
  children?: AcfNode[];           // group, repeater
  /** Group: prefix of its children's keys, after the group's own key ('' for a seamless clone). */
  childPrefix?: string;
  layouts?: Layout[];             // flexible
  // select
  choices?: string[];
  choiceLabels?: Record<string, string>;
  multiple?: boolean;
  // relation
  many?: boolean;
  target?: string;
  // what the values turned out to be (pass 1)
  seen: {
    values: Set<string>; arrays: boolean; php: boolean; strings: boolean;
    badNumber: boolean; badDate: boolean; badColor: boolean;
    refTypes: Set<string>; refOther: boolean;
  };
}

/** Field types that hold no data (layout only). */
const NO_DATA = new Set(['tab', 'accordion', 'message', 'separator', 'output']);

const KIND_OF: Record<string, Kind> = {
  text: 'text', email: 'text', password: 'text', url: 'text', oembed: 'text', time_picker: 'text', file: 'text',
  textarea: 'textarea', wysiwyg: 'richtext', number: 'number', range: 'number', true_false: 'boolean',
  select: 'select', checkbox: 'select', radio: 'select', button_group: 'select',
  image: 'image', gallery: 'repeater', link: 'group', color_picker: 'color',
  date_picker: 'date', date_time_picker: 'datetime',
  post_object: 'relation', page_link: 'relation', relationship: 'relation',
  taxonomy: 'json', user: 'json', google_map: 'json',
  group: 'group', repeater: 'repeater', flexible_content: 'flexible',
};

/** ACF name → a valid NodePress field name (lowercase letters, digits, underscores). */
export function fieldName(acfName: string): string {
  const n = acfName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return !n ? 'field' : /^[0-9]/.test(n) ? `f_${n}` : n;
}

function unique(name: string, used: Set<string>): string {
  let n = name;
  for (let i = 2; used.has(n); i++) n = `${name}_${i}`;
  used.add(n);
  return n;
}

/** A node's name: top-level fields that clash with the import's own (title, content…) get "acf_". */
function nameFor(acfName: string, used: Set<string>, depth: number): string {
  const base = fieldName(acfName);
  return unique(depth === 0 && used.has(base) ? `acf_${base}` : base, used);
}

const emptySeen = (): AcfNode['seen'] => ({
  values: new Set(), arrays: false, php: false, strings: false,
  badNumber: false, badDate: false, badColor: false, refTypes: new Set(), refOther: false,
});

const plainText = (html: unknown) =>
  typeof html === 'string' ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500) : '';

function simpleNode(name: string, acf: string, label: string, acfType: string, kind: Kind): AcfNode {
  return { name, acf, label, acfType, kind, config: {}, seen: emptySeen() };
}

/**
 * Turn ACF fields into nodes. `used` holds the sibling names already taken
 * (reserved names included); `depth` counts the containers around them.
 */
export function buildNodes(fields: AcfField[], defs: AcfDefinitions, depth: number, used: Set<string>, cloneTrail = new Set<string>()): AcfNode[] {
  const out: AcfNode[] = [];
  for (const f of fields) {
    if (NO_DATA.has(f.type)) continue;

    if (f.type === 'clone') {
      // Cloned fields (or whole groups) appear in place; with prefix_name their keys get "<clone>_".
      const keys: string[] = Array.isArray(f.config.clone) ? f.config.clone.filter((k: unknown) => typeof k === 'string') : [];
      const cloned: AcfField[] = [];
      for (const k of keys) {
        if (cloneTrail.has(k)) continue; // a clone of itself
        const field = defs.fieldsByKey.get(k);
        if (field) cloned.push(field);
        else cloned.push(...(defs.groups.find((g) => g.key === k)?.fields ?? []));
      }
      const trail = new Set([...cloneTrail, ...keys]);
      const prefix = f.config.prefix_name ? `${f.name}_` : '';
      if (f.config.display === 'group') {
        const node = simpleNode(nameFor(f.name, used, depth), f.name, f.label || f.name, 'clone', 'group');
        node.children = buildNodes(cloned, defs, depth + 1, new Set(), trail);
        node.childPrefix = prefix;
        node.asJson = depth >= MAX_NESTING || node.children.length === 0;
        out.push(node);
      } else {
        for (const child of buildNodes(cloned, defs, depth, used, trail)) out.push({ ...child, acf: `${prefix}${child.acf}` });
      }
      continue;
    }

    const kind = KIND_OF[f.type] ?? 'text';
    const node: AcfNode = {
      name: nameFor(f.name, used, depth), acf: f.name, label: f.label || f.name,
      ...(plainText(f.config.instructions) ? { description: plainText(f.config.instructions) } : {}),
      acfType: f.type, kind, config: f.config, seen: emptySeen(),
    };

    if (kind === 'select') {
      const choices = f.config.choices;
      const entries: [string, string][] = Array.isArray(choices)
        ? choices.map((c: unknown) => [String(c), String(c)])
        : Object.entries(asRecord(choices)).map(([v, l]) => [String(v), String(l)]);
      node.choices = [...new Set(entries.map(([v]) => v).filter(Boolean))];
      const labels = Object.fromEntries(entries.filter(([v, l]) => v && l && l !== v));
      if (Object.keys(labels).length) node.choiceLabels = labels;
      node.multiple = f.type === 'checkbox' || f.config.multiple == 1;
    } else if (kind === 'relation') {
      node.many = f.type === 'relationship' || f.config.multiple == 1;
    } else if (f.type === 'gallery') {
      node.children = [simpleNode('image', '', 'Image', 'image', 'image')];
      node.asJson = depth >= MAX_NESTING;
    } else if (f.type === 'link') {
      node.children = [
        simpleNode('title', 'title', 'Title', 'text', 'text'),
        simpleNode('url', 'url', 'URL', 'text', 'text'),
        simpleNode('target', 'target', 'Target', 'text', 'text'),
      ];
      node.asJson = depth >= MAX_NESTING;
    } else if (kind === 'group' || kind === 'repeater') {
      node.children = buildNodes(f.children, defs, depth + 1, new Set(), cloneTrail);
      node.asJson = depth >= MAX_NESTING || node.children.length === 0;
    } else if (kind === 'flexible') {
      const layoutDefs = Object.values(asRecord(f.config.layouts)).filter((l: any) => l && typeof l.name === 'string');
      const layoutNames = new Set<string>();
      node.layouts = layoutDefs.map((l: any) => ({
        name: unique(fieldName(l.name), layoutNames),
        acf: l.name,
        label: typeof l.label === 'string' && l.label ? l.label : l.name,
        children: buildNodes(f.children.filter((c) => c.config.parent_layout === l.key), defs, depth + 1, new Set(), cloneTrail),
      }));
      node.asJson = depth >= MAX_NESTING || node.layouts.length === 0;
    }
    out.push(node);
  }
  return out;
}

// ── Values ──────────────────────────────────────────────────────────────────

export interface ReadContext {
  meta: Record<string, string>;
  /** Meta keys the ACF fields read (with their `_key` twins) — left out of `meta`. */
  consumed: Set<string>;
  /** Keys of the repeaters and flexible fields read — their rows are `<key>_<n>_…`. */
  containers: Set<string>;
  attachments: Map<number, { url: string; alt: string }>;
  /** WordPress post ID → the post (its content type when it's imported). */
  posts: Map<number, { postType: string; title: string; slug: string; contentType?: string }>;
  terms: Map<number, { name: string; slug: string; taxonomy: string }>;
  users: Map<number, { login: string; displayName: string }>;
  /** Pass 1 records what the values are; pass 2 returns them in their final shape. */
  observe: boolean;
  issues: { missingAttachments: Set<number>; unknownLayouts: Set<string> };
}

/** A relation the import resolves to publicIds once the entries exist. */
export const WP_REF = '__wp_ref';
export type WpRef = { [WP_REF]: number[] };

const toId = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** The IDs an ACF value lists: a serialized array, or a single number. */
function idsOf(raw: string, parsed: PhpValue | undefined): number[] {
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.values(parsed) : [raw];
  return list.map(toId).filter((n): n is number => n !== undefined);
}

function textValue(raw: string, node: AcfNode, ctx: ReadContext): unknown {
  const parsed = isSerializedPhp(raw) ? unserializePhp(raw) : undefined;
  if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
    if (ctx.observe) node.seen.php = true;
    return parsed;
  }
  if (ctx.observe) node.seen.strings = true;
  // WordPress saves these escaped ("&amp;"); a frontend needs the real URL.
  const value = node.acfType === 'url' || node.acfType === 'oembed' || node.acfType === 'email' ? decodeEntities(raw) : raw;
  return node.kind === 'json' ? { value } : value;
}

function attachment(raw: string, ctx: ReadContext): { url: string; alt?: string } | undefined {
  const id = toId(raw);
  if (id === undefined) return /^https?:\/\//i.test(raw.trim()) ? { url: raw.trim() } : undefined;
  const att = ctx.attachments.get(id);
  if (!att) { ctx.issues.missingAttachments.add(id); return undefined; }
  return att.alt ? { url: att.url, alt: att.alt } : { url: att.url };
}

/** Read one field's value from meta key `key`. undefined = no value. */
export function readNode(node: AcfNode, key: string, ctx: ReadContext): unknown {
  const raw = ctx.meta[key];
  if (raw !== undefined) { ctx.consumed.add(key); ctx.consumed.add(`_${key}`); }

  switch (node.acfType) {
    case 'group':
    case 'clone':
    case 'link':
    case 'gallery':
    case 'repeater':
    case 'flexible_content':
      return readContainer(node, key, raw, ctx);
  }
  if (raw === undefined || raw === '') return undefined;

  switch (node.acfType) {
    case 'number':
    case 'range': {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) return node.kind === 'number' ? n : raw;
      if (ctx.observe) node.seen.badNumber = true;
      return raw;
    }
    case 'true_false':
      return raw === '1' || raw === 'true';
    case 'select':
    case 'checkbox':
    case 'radio':
    case 'button_group': {
      const parsed = unserializePhp(raw);
      const values = (Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? Object.values(parsed) : [raw])
        .filter((v) => v !== null && v !== '' && typeof v !== 'object').map(String);
      if (ctx.observe) {
        values.forEach((v) => node.seen.values.add(v));
        if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) node.seen.arrays = true;
      }
      if (!values.length) return undefined;
      if (node.kind === 'json') return values;
      return node.multiple ? values : values[0];
    }
    case 'image':
      return attachment(raw, ctx);
    case 'file':
      return attachment(raw, ctx)?.url;
    case 'post_object':
    case 'page_link':
    case 'relationship': {
      const parsed = unserializePhp(raw);
      const ids = idsOf(raw, parsed);
      if (ctx.observe) {
        for (const id of ids) {
          const t = ctx.posts.get(id)?.contentType;
          if (t) node.seen.refTypes.add(t); else node.seen.refOther = true;
        }
        if (!ids.length) node.seen.refOther = true; // a URL (page_link to an archive)
      }
      if (node.kind === 'relation') {
        const own = ids.filter((id) => ctx.posts.get(id)?.contentType === node.target);
        return own.length ? ({ [WP_REF]: node.many ? own : own.slice(0, 1) } as WpRef) : undefined;
      }
      // Several possible targets (or none imported): a snapshot of what was linked.
      const snapshot = ids.length
        ? ids.map((id) => {
            const p = ctx.posts.get(id);
            return p ? { wp_id: id, post_type: p.postType, slug: p.slug, title: p.title } : { wp_id: id };
          })
        : [{ url: raw }];
      return node.many ? snapshot : snapshot[0];
    }
    case 'taxonomy': {
      const parsed = unserializePhp(raw);
      const names = idsOf(raw, parsed).map((id) => ctx.terms.get(id)).filter(Boolean)
        .map((t) => ({ name: t!.name, slug: t!.slug, taxonomy: t!.taxonomy }));
      return names.length ? names : undefined;
    }
    case 'user': {
      const parsed = unserializePhp(raw);
      const users = idsOf(raw, parsed).map((id) => ctx.users.get(id)).filter(Boolean)
        .map((u) => ({ login: u!.login, display_name: u!.displayName }));
      return users.length ? users : undefined;
    }
    case 'date_picker': {
      const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw.trim());
      if (m && !isNaN(Date.parse(`${m[1]}-${m[2]}-${m[3]}`))) return `${m[1]}-${m[2]}-${m[3]}`;
      if (ctx.observe) node.seen.badDate = true;
      return raw;
    }
    case 'date_time_picker': {
      const v = raw.trim().replace(' ', 'T');
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) && !isNaN(new Date(v).getTime())) return v;
      if (ctx.observe) node.seen.badDate = true;
      return raw;
    }
    case 'color_picker':
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.trim())) return raw.trim();
      if (ctx.observe) node.seen.badColor = true;
      return raw;
    case 'google_map':
      return unserializePhp(raw) ?? { value: raw };
    default:
      return textValue(raw, node, ctx);
  }
}

function readContainer(node: AcfNode, key: string, raw: string | undefined, ctx: ReadContext): unknown {
  if (node.acfType === 'repeater' || node.acfType === 'flexible_content') ctx.containers.add(key);
  switch (node.acfType) {
    case 'link': {
      if (raw === undefined || raw === '') return undefined;
      const parsed = unserializePhp(raw);
      const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { url: raw };
      const out: Record<string, string> = {};
      for (const k of ['title', 'url', 'target']) {
        const v = (obj as Record<string, unknown>)[k];
        if (typeof v === 'string' && v) out[k] = k === 'url' ? decodeEntities(v) : v;
      }
      return Object.keys(out).length ? out : undefined;
    }
    case 'gallery': {
      if (raw === undefined || raw === '') return undefined;
      const images = idsOf(raw, unserializePhp(raw)).map((id) => attachment(String(id), ctx)).filter(Boolean);
      if (!images.length) return undefined;
      return node.asJson ? images : images.map((image) => ({ image }));
    }
    case 'group':
    case 'clone': {
      const prefix = node.childPrefix ?? `${key}_`;
      const base = node.acfType === 'clone' ? key.slice(0, key.length - node.acf.length) : '';
      const obj: Record<string, unknown> = {};
      for (const child of node.children ?? []) {
        const v = readNode(child, node.acfType === 'clone' ? `${base}${prefix}${child.acf}` : `${prefix}${child.acf}`, ctx);
        if (v !== undefined) obj[child.name] = v;
      }
      return Object.keys(obj).length ? obj : undefined;
    }
    case 'repeater': {
      const count = Math.min(parseInt(raw ?? '', 10) || 0, 10_000);
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < count; i++) {
        const row: Record<string, unknown> = {};
        for (const child of node.children ?? []) {
          const v = readNode(child, `${key}_${i}_${child.acf}`, ctx);
          if (v !== undefined) row[child.name] = v;
        }
        rows.push(row);
      }
      return rows.length ? rows : undefined;
    }
    case 'flexible_content': {
      const parsed = raw ? unserializePhp(raw) : undefined;
      const names = Array.isArray(parsed) ? parsed : [];
      const rows: Record<string, unknown>[] = [];
      names.forEach((layoutName, i) => {
        const layout = node.layouts?.find((l) => l.acf === layoutName);
        if (!layout) { ctx.issues.unknownLayouts.add(String(layoutName)); return; }
        const row: Record<string, unknown> = { _layout: layout.name };
        for (const child of layout.children) {
          const v = readNode(child, `${key}_${i}_${child.acf}`, ctx);
          if (v !== undefined) row[child.name] = v;
        }
        rows.push(row);
      });
      return rows.length ? rows : undefined;
    }
  }
  return undefined;
}

// ── Final shape ─────────────────────────────────────────────────────────────

/**
 * After pass 1: settle each field's NodePress type from what its values were —
 * select choices extended with the values used, relations pointed at the one
 * content type they link to (or kept as snapshots), non-conforming numbers,
 * dates and colors kept as text.
 */
export function finalizeNodes(nodes: AcfNode[], importedTypeFor: (postType: string) => string | undefined): void {
  for (const node of nodes) {
    const s = node.seen;
    switch (node.kind) {
      case 'select': {
        const choices = [...new Set([...(node.choices ?? []), ...s.values])].filter(Boolean);
        node.choices = choices;
        if (s.arrays) node.multiple = true;
        if (!choices.length) node.kind = node.multiple ? 'json' : 'text';
        break;
      }
      case 'relation': {
        const allowed: string[] = Array.isArray(node.config.post_type) ? node.config.post_type.filter((t: unknown) => typeof t === 'string') : [];
        const configured = allowed.length === 1 ? importedTypeFor(allowed[0]) : undefined;
        const target = s.refOther ? undefined
          : s.refTypes.size === 1 ? [...s.refTypes][0]
          : s.refTypes.size === 0 ? configured
          : undefined;
        if (target) node.target = target; else node.kind = 'json';
        break;
      }
      case 'number': if (s.badNumber) node.kind = 'text'; break;
      case 'date':
      case 'datetime': if (s.badDate) node.kind = 'text'; break;
      case 'color': if (s.badColor) node.kind = 'text'; break;
      case 'text':
      case 'textarea':
      case 'richtext':
        if (s.php) node.kind = 'json';
        break;
    }
    if (node.children) finalizeNodes(node.children, importedTypeFor);
    for (const l of node.layouts ?? []) finalizeNodes(l.children, importedTypeFor);
  }
}

/** The NodePress field definitions for a list of nodes. */
export function nodeSchema(nodes: AcfNode[]): Record<string, unknown>[] {
  return nodes.map((node) => {
    const base = { name: node.name, label: node.label, ...(node.description ? { description: node.description } : {}) };
    if (node.asJson) return { ...base, type: 'json' };
    switch (node.kind) {
      case 'select':
        return {
          ...base, type: 'select',
          options: {
            choices: node.choices, ...(node.multiple ? { multiple: true } : {}),
            ...(node.choiceLabels ? { choiceLabels: node.choiceLabels } : {}),
          },
        };
      case 'relation':
        return { ...base, type: 'relation', options: { relatedContentType: node.target, cardinality: node.many ? 'many' : 'one' } };
      case 'group':
      case 'repeater':
        return { ...base, type: node.kind, options: { subFields: nodeSchema(node.children ?? []) } };
      case 'flexible':
        return {
          ...base, type: 'flexible',
          options: {
            layouts: (node.layouts ?? []).map((l) => ({
              name: l.name, label: l.label,
              // NodePress layouts need a field; WordPress allows empty ones.
              fields: l.children.length ? nodeSchema(l.children) : [{ name: 'note', type: 'text', label: 'Note', description: 'This layout has no fields in WordPress' }],
            })),
          },
        };
      default:
        return { ...base, type: node.kind };
    }
  });
}

// ── Meta without definitions ────────────────────────────────────────────────

/**
 * Post meta as nested data, for keys no ACF definition covers (ACF fields
 * registered in theme code, other plugins): serialized PHP becomes JSON,
 * `<name>` + `<name>_0_…` keys become rows — a flexible field's when `<name>`
 * lists layouts (each row gets `_layout`), a repeater's when it is a count.
 * Keys starting with "_" (WordPress and plugin internals) are left out.
 */
export function structureMeta(meta: Record<string, string>): Record<string, unknown> {
  const keys = Object.keys(meta).filter((k) => !k.startsWith('_'));
  return structureLevel(keys, (k) => meta[k], '', 0);
}

function structureLevel(keys: string[], get: (k: string) => string, prefix: string, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const claimed = new Set<string>();
  // Shortest names first: an outer container claims its rows' keys before an inner one is tried.
  const local = keys.map((k) => k.slice(prefix.length)).sort((a, b) => a.length - b.length);
  if (depth < 8) {
    for (const name of local) {
      if (claimed.has(name)) continue;
      const raw = get(prefix + name);
      const parsed = unserializePhp(raw);
      const layouts = Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed as string[] : undefined;
      const count = /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
      const rowsLength = layouts ? layouts.length : count;
      if (!rowsLength || rowsLength > 10_000 || !local.some((k) => k.startsWith(`${name}_0_`))) continue;
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < rowsLength; i++) {
        const rowPrefix = `${name}_${i}_`;
        const rowKeys = local.filter((k) => k.startsWith(rowPrefix));
        rowKeys.forEach((k) => claimed.add(k));
        const row = structureLevel(rowKeys.map((k) => prefix + k), get, prefix + rowPrefix, depth + 1);
        rows.push(layouts ? { _layout: layouts[i], ...row } : row);
      }
      claimed.add(name);
      out[name] = rows;
    }
  }
  for (const name of local) {
    if (claimed.has(name)) continue;
    const raw = get(prefix + name);
    const parsed = isSerializedPhp(raw) ? unserializePhp(raw) : undefined;
    out[name] = parsed !== undefined ? parsed : raw;
  }
  return out;
}
