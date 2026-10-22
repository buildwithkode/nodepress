import { XmlElement, XmlParseError, XmlParseOptions, childElements, childText, firstChild, parseXml, textContent } from './xml';

/**
 * WordPress eXtended RSS (WXR, Tools → Export) → a plain description of what
 * to import. Pure functions: no database, no network.
 */

export interface WxrAuthor { login: string; email: string; displayName: string }
export interface WxrTerm { slug: string; name: string; parent?: string }

export interface WxrItem {
  postId: number;
  title: string;
  link: string;
  creator: string;              // author login
  content: string;
  excerpt: string;
  postName: string;
  status: string;
  postType: string;
  postDate: string;             // site-local "YYYY-MM-DD HH:MM:SS"
  postDateGmt: string;
  attachmentUrl: string;
  categories: string[];         // names, domain="category"
  tags: string[];               // names, domain="post_tag"
  otherTerms: Record<string, string[]>; // custom taxonomies
  meta: Record<string, string>; // every postmeta key, underscore ones included
}

export interface WxrDocument {
  title: string;
  link: string;
  language: string;
  version: string;
  authors: WxrAuthor[];
  categories: WxrTerm[];
  tags: WxrTerm[];
  items: WxrItem[];
}

export function parseWxr(xml: string, options?: XmlParseOptions): WxrDocument {
  const root = parseXml(xml, options);
  if (root.name !== 'rss') throw new XmlParseError(`Not a WordPress export: root element is <${root.name}>, expected <rss>`);
  const channel = firstChild(root, 'channel');
  if (!channel) throw new XmlParseError('Not a WordPress export: <channel> is missing');
  const version = childText(channel, 'wp:wxr_version');
  if (!version) throw new XmlParseError('Not a WordPress export: <wp:wxr_version> is missing');

  return {
    title: childText(channel, 'title'),
    link: childText(channel, 'link'),
    language: childText(channel, 'language'),
    version,
    authors: childElements(channel, 'wp:author').map((a) => ({
      login: childText(a, 'wp:author_login'),
      email: childText(a, 'wp:author_email'),
      displayName: childText(a, 'wp:author_display_name') || childText(a, 'wp:author_login'),
    })),
    categories: childElements(channel, 'wp:category').map((c) => ({
      slug: childText(c, 'wp:category_nicename'),
      name: childText(c, 'wp:cat_name'),
      parent: childText(c, 'wp:category_parent') || undefined,
    })),
    tags: childElements(channel, 'wp:tag').map((t) => ({
      slug: childText(t, 'wp:tag_slug'),
      name: childText(t, 'wp:tag_name'),
    })),
    items: childElements(channel, 'item').map(parseItem),
  };
}

function parseItem(el: XmlElement): WxrItem {
  const categories: string[] = [];
  const tags: string[] = [];
  const otherTerms: Record<string, string[]> = {};
  for (const c of childElements(el, 'category')) {
    const name = textContent(c).trim();
    if (!name) continue;
    const domain = c.attrs.domain ?? 'category';
    const list = domain === 'category' ? categories : domain === 'post_tag' ? tags : (otherTerms[domain] ??= []);
    if (!list.includes(name)) list.push(name);
  }
  const meta: Record<string, string> = {};
  for (const m of childElements(el, 'wp:postmeta')) {
    const key = childText(m, 'wp:meta_key');
    if (key) meta[key] = textContent(firstChild(m, 'wp:meta_value'));
  }
  return {
    postId: parseInt(childText(el, 'wp:post_id'), 10) || 0,
    title: childText(el, 'title'),
    link: childText(el, 'link'),
    creator: childText(el, 'dc:creator'),
    content: textContent(firstChild(el, 'content:encoded')),
    excerpt: childText(el, 'excerpt:encoded'),
    postName: childText(el, 'wp:post_name'),
    status: childText(el, 'wp:status'),
    postType: childText(el, 'wp:post_type') || 'post',
    postDate: childText(el, 'wp:post_date'),
    postDateGmt: childText(el, 'wp:post_date_gmt'),
    attachmentUrl: childText(el, 'wp:attachment_url'),
    categories,
    tags,
    otherTerms,
    meta,
  };
}

// ── Mapping to NodePress ────────────────────────────────────────────────────

/** Post types that are WordPress internals, not content. */
const SKIPPED_POST_TYPES = new Set([
  'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request',
  'wp_block', 'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation',
  'wp_font_family', 'wp_font_face', 'acf-field-group', 'acf-field', 'acf-post-type', 'acf-taxonomy',
  'acf-ui-options-page', 'scheduled-action', 'shop_order', 'shop_order_refund',
]);
const SKIPPED_STATUSES = new Set(['trash', 'auto-draft', 'inherit']);

/** Content type names the core reserves (ContentTypeService) — a post type with one gets a `wp_` prefix. */
const RESERVED_TYPE_NAMES = new Set(['auth', 'media', 'entries', 'content-types', 'content_types', 'uploads', 'import', 'components', 'roles', 'redirects']);

export type ImportStatus = 'published' | 'draft' | 'pending_review';

/** The fields every imported content type gets (an existing type keeps its own schema). */
export const WP_FIELDS = [
  { name: 'title', type: 'text', label: 'Title', required: true },
  { name: 'content', type: 'richtext', label: 'Content' },
  { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
  { name: 'featured_image', type: 'image', label: 'Featured image' },
  { name: 'categories', type: 'json', label: 'Categories', description: 'Category names from WordPress' },
  { name: 'tags', type: 'json', label: 'Tags', description: 'Tag names from WordPress' },
  { name: 'author', type: 'text', label: 'Author' },
  { name: 'wp_id', type: 'number', label: 'WordPress ID', options: { integer: true } },
  { name: 'meta', type: 'json', label: 'Custom fields', description: 'WordPress post meta (ACF values included); keys starting with "_" are left out' },
] as const;

export interface PlannedAttachment {
  postId: number;
  url: string;
  title: string;
  alt: string;
}

export interface PlannedEntry {
  wpId: number;
  postType: string;
  contentType: string;
  slug: string;
  status: ImportStatus;
  wpStatus: string;
  /** For WordPress "future" posts: when the scheduler should publish it. */
  publishAt?: string;
  /** The WordPress publish date (GMT) — becomes the entry's createdAt. */
  date?: string;
  data: {
    title: string;
    content: string;
    excerpt: string;
    featured_image?: { url: string; alt?: string };
    categories: string[];
    tags: string[];
    author: string;
    wp_id: number;
    meta: Record<string, string>;
  };
  /** The attachment the featured image comes from (rewritten after a media import). */
  featuredAttachmentId?: number;
}

export interface ImportPlan {
  site: { title: string; link: string; language: string; version: string };
  entries: PlannedEntry[];
  attachments: PlannedAttachment[];
  /** Content type name → WordPress post type it comes from. */
  contentTypes: Record<string, string>;
  skipped: Record<string, number>;
  warnings: string[];
}

/**
 * Lowercase ASCII slug that passes assertValidSlug: letters and digits joined
 * by single hyphens, max 200 characters. '' when nothing is left.
 */
export function slugify(input: string): string {
  let s = input;
  try { s = decodeURIComponent(s); } catch { /* not percent-encoded */ }
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/, '');
}

/** WordPress post type → content type name (same rules as ContentTypeService's normalizeName). */
export function contentTypeNameFor(postType: string): string {
  const name = postType.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  return !name || RESERVED_TYPE_NAMES.has(name) ? `wp_${name || 'type'}` : name;
}

/** WordPress status → NodePress status, or null to skip the item. */
export function mapStatus(wpStatus: string): ImportStatus | null {
  switch (wpStatus) {
    case 'publish': return 'published';
    case 'pending': return 'pending_review';
    case 'draft':
    case 'future':  // published later by the scheduler via publishAt
    case 'private': // no private entries in NodePress — kept as a draft
      return 'draft';
    default: return null;
  }
}

/** "2025-01-14 07:30:00" (GMT) → ISO string; undefined for WordPress' zero date or junk. */
export function wpDateToIso(value: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m || m[1] === '0000') return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Post meta worth keeping: everything except WordPress/plugin internals (keys starting with "_"). */
export function publicMeta(meta: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

/** Turn a parsed export into the entries and attachments to import. */
export function buildImportPlan(doc: WxrDocument): ImportPlan {
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };

  const authors = new Map(doc.authors.map((a) => [a.login, a.displayName]));
  const attachments = new Map<number, PlannedAttachment>();
  for (const item of doc.items) {
    if (item.postType !== 'attachment' || !item.attachmentUrl) continue;
    attachments.set(item.postId, {
      postId: item.postId,
      url: item.attachmentUrl,
      title: item.title,
      alt: item.meta._wp_attachment_image_alt ?? '',
    });
  }

  const entries: PlannedEntry[] = [];
  const contentTypes: Record<string, string> = {};
  const usedSlugs = new Set<string>();
  const ignoredTaxonomies = new Set<string>();

  for (const item of doc.items) {
    if (item.postType === 'attachment') continue;
    if (SKIPPED_POST_TYPES.has(item.postType)) { skip(`type:${item.postType}`); continue; }
    if (SKIPPED_STATUSES.has(item.status)) { skip(`status:${item.status}`); continue; }
    const status = mapStatus(item.status);
    if (!status) { skip(`status:${item.status || 'unknown'}`); continue; }

    const contentType = contentTypeNameFor(item.postType);
    contentTypes[contentType] = item.postType;

    let slug = slugify(item.postName) || slugify(item.title) || `${slugify(item.postType) || 'item'}-${item.postId}`;
    if (usedSlugs.has(`${contentType}/${slug}`)) {
      const unique = `${slug.slice(0, 190)}-${item.postId}`;
      warnings.push(`${item.postType} #${item.postId}: slug "${slug}" is used twice in this file — imported as "${unique}"`);
      slug = unique;
    }
    usedSlugs.add(`${contentType}/${slug}`);

    const date = wpDateToIso(item.postDateGmt) ?? wpDateToIso(item.postDate);
    const thumbId = parseInt(item.meta._thumbnail_id ?? '', 10);
    const thumb = attachments.get(thumbId);
    if (item.meta._thumbnail_id && !thumb) {
      warnings.push(`${item.postType} #${item.postId}: featured image (attachment #${item.meta._thumbnail_id}) is not in this export`);
    }
    for (const domain of Object.keys(item.otherTerms)) ignoredTaxonomies.add(domain);

    entries.push({
      wpId: item.postId,
      postType: item.postType,
      contentType,
      slug,
      status,
      wpStatus: item.status,
      publishAt: item.status === 'future' ? date : undefined,
      date,
      data: {
        title: item.title || slug,
        content: item.content,
        excerpt: item.excerpt,
        featured_image: thumb ? { url: thumb.url, ...(thumb.alt ? { alt: thumb.alt } : {}) } : undefined,
        categories: item.categories,
        tags: item.tags,
        author: authors.get(item.creator) ?? item.creator,
        wp_id: item.postId,
        meta: publicMeta(item.meta),
      },
      featuredAttachmentId: thumb ? thumb.postId : undefined,
    });
  }

  if (ignoredTaxonomies.size) {
    warnings.push(`Custom taxonomies are not imported: ${[...ignoredTaxonomies].sort().join(', ')}`);
  }

  return {
    site: { title: doc.title, link: doc.link, language: doc.language, version: doc.version },
    entries,
    attachments: [...attachments.values()],
    contentTypes,
    skipped,
    warnings,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pattern for an attachment URL and its resized copies ("photo-300x200.jpg" for "photo.jpg"), http or https. */
function attachmentUrlPattern(url: string): RegExp {
  const bare = url.replace(/^https?:\/\//, '');
  const dot = bare.lastIndexOf('.');
  const body = dot > bare.lastIndexOf('/')
    ? `${escapeRe(bare.slice(0, dot))}(?:-\\d+x\\d+)?${escapeRe(bare.slice(dot))}`
    : escapeRe(bare);
  return new RegExp(`https?://${body}`, 'g');
}

/**
 * Replace attachment URLs in HTML with their new URLs — including the resized
 * copies WordPress links to, which all point at the one imported original.
 */
export function rewriteMediaUrls(html: string, urlMap: Map<string, string>): string {
  if (!html || urlMap.size === 0) return html;
  let out = html;
  for (const [oldUrl, newUrl] of urlMap) out = out.replace(attachmentUrlPattern(oldUrl), () => newUrl);
  return out;
}
