import { XmlElement, XmlParseError, XmlParseOptions, childElements, childText, decodeEntities, firstChild, parseXml, textContent } from './xml';
import { AcfNode, ReadContext, buildNodes, finalizeNodes, groupsForPostType, nodeSchema, readAcfDefinitions, readNode, structureMeta } from './acf';

/**
 * WordPress eXtended RSS (WXR, Tools → Export) → a plain description of what
 * to import. Pure functions: no database, no network.
 */

export interface WxrAuthor { id: number; login: string; email: string; displayName: string; firstName: string; lastName: string }
export interface WxrTerm { id: number; slug: string; name: string; parent?: string }
/** A <wp:term> — custom taxonomies, nav menus, post formats. */
export interface WxrCustomTerm extends WxrTerm { taxonomy: string }

/** A <wp:comment>. The commenter's email, URL and IP are deliberately not read. */
export interface WxrComment {
  id: number;
  author: string;
  date: string;                 // site-local
  dateGmt: string;
  content: string;
  approved: string;             // "1", "0" (pending), "spam", "trash"
  type: string;                 // "" / "comment", "pingback", "trackback"
  parent: number;               // 0 = top level
}

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
  postParent: number;           // 0 = none (ACF: the field group or parent field)
  menuOrder: number;
  postDate: string;             // site-local "YYYY-MM-DD HH:MM:SS"
  postDateGmt: string;
  attachmentUrl: string;
  categories: string[];         // names, domain="category"
  categorySlugs: string[];      // their nicenames (where given), for the hierarchy
  tags: string[];               // names, domain="post_tag"
  otherTerms: Record<string, string[]>; // custom taxonomies
  meta: Record<string, string>; // every postmeta key, underscore ones included
  comments: WxrComment[];
}

export interface WxrDocument {
  title: string;
  link: string;
  language: string;
  version: string;
  authors: WxrAuthor[];
  categories: WxrTerm[];
  tags: WxrTerm[];
  terms: WxrCustomTerm[];
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
      id: parseInt(childText(a, 'wp:author_id'), 10) || 0,
      login: childText(a, 'wp:author_login'),
      email: childText(a, 'wp:author_email'),
      displayName: childText(a, 'wp:author_display_name') || childText(a, 'wp:author_login'),
      firstName: childText(a, 'wp:author_first_name'),
      lastName: childText(a, 'wp:author_last_name'),
    })),
    categories: childElements(channel, 'wp:category').map((c) => ({
      id: parseInt(childText(c, 'wp:term_id'), 10) || 0,
      slug: childText(c, 'wp:category_nicename'),
      name: childText(c, 'wp:cat_name'),
      parent: childText(c, 'wp:category_parent') || undefined,
    })),
    tags: childElements(channel, 'wp:tag').map((t) => ({
      id: parseInt(childText(t, 'wp:term_id'), 10) || 0,
      slug: childText(t, 'wp:tag_slug'),
      name: childText(t, 'wp:tag_name'),
    })),
    terms: childElements(channel, 'wp:term').map((t) => ({
      id: parseInt(childText(t, 'wp:term_id'), 10) || 0,
      taxonomy: childText(t, 'wp:term_taxonomy'),
      slug: childText(t, 'wp:term_slug'),
      name: childText(t, 'wp:term_name'),
      parent: childText(t, 'wp:term_parent') || undefined,
    })),
    items: childElements(channel, 'item').map(parseItem),
  };
}

function parseItem(el: XmlElement): WxrItem {
  const categories: string[] = [];
  const categorySlugs: string[] = [];
  const tags: string[] = [];
  const otherTerms: Record<string, string[]> = {};
  for (const c of childElements(el, 'category')) {
    const name = textContent(c).trim();
    if (!name) continue;
    const domain = c.attrs.domain ?? 'category';
    const list = domain === 'category' ? categories : domain === 'post_tag' ? tags : (otherTerms[domain] ??= []);
    if (!list.includes(name)) list.push(name);
    if (domain === 'category' && c.attrs.nicename && !categorySlugs.includes(c.attrs.nicename)) categorySlugs.push(c.attrs.nicename);
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
    postParent: parseInt(childText(el, 'wp:post_parent'), 10) || 0,
    menuOrder: parseInt(childText(el, 'wp:menu_order'), 10) || 0,
    postDate: childText(el, 'wp:post_date'),
    postDateGmt: childText(el, 'wp:post_date_gmt'),
    attachmentUrl: childText(el, 'wp:attachment_url'),
    categories,
    categorySlugs,
    tags,
    otherTerms,
    meta,
    comments: childElements(el, 'wp:comment').map((c) => ({
      id: parseInt(childText(c, 'wp:comment_id'), 10) || 0,
      author: childText(c, 'wp:comment_author'),
      date: childText(c, 'wp:comment_date'),
      dateGmt: childText(c, 'wp:comment_date_gmt'),
      content: textContent(firstChild(c, 'wp:comment_content')),
      approved: childText(c, 'wp:comment_approved'),
      type: childText(c, 'wp:comment_type'),
      parent: parseInt(childText(c, 'wp:comment_parent'), 10) || 0,
    })),
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
const RESERVED_TYPE_NAMES = new Set(['auth', 'media', 'entries', 'content-types', 'content_types', 'uploads', 'import', 'components', 'roles', 'redirects', 'choice-lists', 'choice_lists']);

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
  { name: 'meta', type: 'json', label: 'Custom fields', description: 'WordPress post meta not covered by ACF field definitions, as nested data; keys starting with "_" are left out' },
] as const;

/** Content types for the optional author and comment imports. */
export const AUTHOR_TYPE = 'wp_author';
export const COMMENT_TYPE = 'wp_comment';

/** Optional extras — each one adds fields (and, for authors and comments, a content type). */
export interface PlanOptions {
  /** `category_paths`: full "Parent/Child" paths next to the plain names. */
  categoryPaths?: boolean;
  /** `taxonomies`: { taxonomy: [term names] } for custom taxonomies. */
  taxonomies?: boolean;
  /** wp:author → `wp_author` entries + an `author_ref` relation on posts. Never login accounts. */
  authors?: boolean;
  /** Approved wp:comment → `wp_comment` entries. */
  comments?: boolean;
  /** With `comments`: pending comments too (as pending_review). */
  pendingComments?: boolean;
}

export const CATEGORY_PATHS_FIELD = { name: 'category_paths', type: 'json', label: 'Category paths', description: 'Full category paths from WordPress, e.g. "Parent/Child"' };
export const TAXONOMIES_FIELD = { name: 'taxonomies', type: 'json', label: 'Taxonomies', description: 'Custom taxonomy terms from WordPress: { "taxonomy": ["term", …] }' };
export const AUTHOR_REF_FIELD = {
  name: 'author_ref', type: 'relation', label: 'Author entry', description: 'The wp_author entry for this post',
  options: { relatedContentType: AUTHOR_TYPE, cardinality: 'one' },
};

/** Email is left out on purpose: it is personal data an editor may not want copied. */
export const AUTHOR_FIELDS = [
  { name: 'login', type: 'text', label: 'Login', required: true },
  { name: 'display_name', type: 'text', label: 'Display name' },
  { name: 'first_name', type: 'text', label: 'First name' },
  { name: 'last_name', type: 'text', label: 'Last name' },
];

/**
 * `wp_comment` fields. The `post` relation is only there when every imported
 * comment belongs to one content type (a relation points at one type) —
 * otherwise post_type + post_wp_id identify the post.
 */
export function commentFields(postContentType?: string): Record<string, unknown>[] {
  return [
    { name: 'author_name', type: 'text', label: 'Author name' },
    { name: 'content', type: 'textarea', label: 'Comment' },
    { name: 'date', type: 'datetime', label: 'Date' },
    ...(postContentType ? [{ name: 'post', type: 'relation', label: 'Post', options: { relatedContentType: postContentType, cardinality: 'one' } }] : []),
    { name: 'post_wp_id', type: 'number', label: 'WordPress post ID', options: { integer: true } },
    { name: 'post_type', type: 'text', label: 'WordPress post type' },
    { name: 'parent_wp_id', type: 'number', label: 'Reply to (WordPress comment ID)', description: '0 for a top-level comment', options: { integer: true } },
    { name: 'wp_id', type: 'number', label: 'WordPress ID', options: { integer: true } },
  ];
}

/** Taxonomies handled elsewhere (categories, tags) or that aren't content. */
const NOT_CUSTOM_TAXONOMIES = new Set(['category', 'post_tag', 'nav_menu', 'post_format', 'link_category']);

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
    meta: Record<string, unknown>;
    category_paths?: string[];
    taxonomies?: Record<string, string[]>;
    /** ACF fields, by their NodePress names. */
    [field: string]: unknown;
  };
  /** The attachment the featured image comes from (rewritten after a media import). */
  featuredAttachmentId?: number;
  /** With `authors`: login of the wp_author entry `author_ref` points at. */
  authorLogin?: string;
}

export interface PlannedAuthor {
  login: string;
  slug: string;
  data: { login: string; display_name: string; first_name: string; last_name: string };
}

export interface PlannedComment {
  wpId: number;
  slug: string;                 // comment-<wp_id>
  status: 'published' | 'pending_review';
  date?: string;
  /** Content type of the post it belongs to (for the `post` relation). */
  postContentType: string;
  data: {
    author_name: string;
    content: string;
    date?: string;
    post_wp_id: number;
    post_type: string;
    parent_wp_id: number;
    wp_id: number;
  };
}

/** What the file holds for each option, whether or not it is on — shown by the dry run. */
export interface PlanStats {
  /** Categories with a parent. */
  nestedCategories: number;
  /** Custom taxonomy → number of imported entries using it. */
  taxonomies: Record<string, number>;
  /** ACF: field groups in the export, and content type → number of ACF fields it gets. */
  acf: { groups: number; fields: Record<string, number> };
  authors: number;
  comments: { approved: number; pending: number; spam: number; trash: number; other: number };
}

export interface ImportPlan {
  site: { title: string; link: string; language: string; version: string };
  entries: PlannedEntry[];
  attachments: PlannedAttachment[];
  /** Content type name → WordPress post type it comes from. */
  contentTypes: Record<string, string>;
  /**
   * Schema for every content type the import writes to, in creation order
   * (wp_author, the post types, wp_comment). Used to create missing types and
   * to warn about fields an existing type lacks.
   */
  schemas: Record<string, Record<string, unknown>[]>;
  authors: PlannedAuthor[];
  comments: PlannedComment[];
  options: Required<PlanOptions>;
  /** Content types made from ACF options pages: fields only — WordPress doesn't export their values. */
  optionsPages: Record<string, { title: string; slug: string }>;
  stats: PlanStats;
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

/** The HTML named entities comments commonly hold (XML's own five are decoded by decodeEntities). */
const HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', deg: '°', copy: '©', reg: '®', trade: '™', euro: '€', times: '×',
};

/** Strip HTML from a comment: tags out, line breaks kept, entities decoded. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|blockquote|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&([a-z]+);/g, (whole, name: string) => HTML_ENTITIES[name] ?? whole),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Parent/Child" path of a category, from the channel's wp:category parent links. */
function categoryPath(slug: string, bySlug: Map<string, WxrTerm>): string | undefined {
  const names: string[] = [];
  const seen = new Set<string>();
  let cur = bySlug.get(slug);
  while (cur && !seen.has(cur.slug)) {   // a broken export could loop
    seen.add(cur.slug);
    names.unshift(cur.name);
    cur = cur.parent ? bySlug.get(cur.parent) : undefined;
  }
  return names.length ? names.join('/') : undefined;
}

/** Turn a parsed export into the entries and attachments to import. */
export function buildImportPlan(doc: WxrDocument, planOptions: PlanOptions = {}): ImportPlan {
  const options: Required<PlanOptions> = {
    categoryPaths: !!planOptions.categoryPaths,
    taxonomies: !!planOptions.taxonomies,
    authors: !!planOptions.authors,
    comments: !!planOptions.comments,
    pendingComments: !!planOptions.comments && !!planOptions.pendingComments,
  };
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };

  const authors = new Map(doc.authors.map((a) => [a.login, a.displayName]));
  const categoriesBySlug = new Map(doc.categories.filter((c) => c.slug).map((c) => [c.slug, c]));
  const stats: PlanStats = {
    nestedCategories: doc.categories.filter((c) => c.parent).length,
    taxonomies: {},
    authors: doc.authors.length,
    comments: { approved: 0, pending: 0, spam: 0, trash: 0, other: 0 },
    acf: { groups: 0, fields: {} },
  };
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
  const comments: PlannedComment[] = [];
  const usedTaxonomyBy = new Set<string>();   // content types with custom taxonomy terms
  const missingAuthors = new Set<string>();

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
    const taxonomies: Record<string, string[]> = {};
    for (const [domain, terms] of Object.entries(item.otherTerms)) {
      if (NOT_CUSTOM_TAXONOMIES.has(domain)) continue;
      taxonomies[domain] = terms;
      stats.taxonomies[domain] = (stats.taxonomies[domain] ?? 0) + 1;
      if (!options.taxonomies) ignoredTaxonomies.add(domain);
    }
    const hasTaxonomies = Object.keys(taxonomies).length > 0;
    if (hasTaxonomies) usedTaxonomyBy.add(contentType);

    // Names the item lists without a nicename (or that aren't in the channel) stay as they are.
    const categoryPaths: string[] = [];
    if (options.categoryPaths) {
      const pathed = new Set<string>();
      for (const s of item.categorySlugs) {
        const path = categoryPath(s, categoriesBySlug);
        if (path && !categoryPaths.includes(path)) categoryPaths.push(path);
        const term = categoriesBySlug.get(s);
        if (term) pathed.add(term.name);
      }
      for (const name of item.categories) if (!pathed.has(name) && !categoryPaths.includes(name)) categoryPaths.push(name);
    }

    let authorLogin: string | undefined;
    if (options.authors && item.creator) {
      if (authors.has(item.creator)) authorLogin = item.creator;
      else missingAuthors.add(item.creator);
    }

    for (const c of item.comments) {
      const kind = c.approved === '1' ? 'approved' : c.approved === '0' ? 'pending' : c.approved === 'spam' ? 'spam' : c.approved === 'trash' ? 'trash' : 'other';
      stats.comments[kind]++;
      if (!options.comments) continue;
      if (c.type === 'pingback' || c.type === 'trackback') { skip(`comment:${c.type}`); continue; }
      if (kind !== 'approved' && !(kind === 'pending' && options.pendingComments)) { skip(`comment:${kind === 'other' ? c.approved || 'unknown' : kind}`); continue; }
      if (!c.id) { skip('comment:no_id'); continue; }
      const commentDate = wpDateToIso(c.dateGmt) ?? wpDateToIso(c.date);
      comments.push({
        wpId: c.id,
        slug: `comment-${c.id}`,
        status: kind === 'approved' ? 'published' : 'pending_review',
        date: commentDate,
        postContentType: contentType,
        data: {
          author_name: c.author,
          content: stripHtml(c.content),
          date: commentDate,
          post_wp_id: item.postId,
          post_type: item.postType,
          parent_wp_id: c.parent,
          wp_id: c.id,
        },
      });
    }

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
        ...(options.categoryPaths ? { category_paths: categoryPaths } : {}),
        ...(options.taxonomies && hasTaxonomies ? { taxonomies } : {}),
      },
      featuredAttachmentId: thumb ? thumb.postId : undefined,
      ...(authorLogin ? { authorLogin } : {}),
    });
  }

  // Comments on items that aren't imported (trash, internals) are counted with them.
  if (options.comments) {
    const kept = new Set(entries.map((e) => e.wpId));
    for (const item of doc.items) {
      if (kept.has(item.postId) || item.postType === 'attachment') continue;
      for (const c of item.comments) if (c.approved === '1' || c.approved === '0') skip('comment:post_not_imported');
    }
  }

  const plannedAuthors: PlannedAuthor[] = [];
  if (options.authors) {
    const usedAuthorSlugs = new Set<string>();
    for (const [i, a] of doc.authors.entries()) {
      if (!a.login) continue;
      let slug = slugify(a.login) || `author-${i + 1}`;
      if (usedAuthorSlugs.has(slug)) slug = `${slug.slice(0, 190)}-${i + 1}`;
      usedAuthorSlugs.add(slug);
      plannedAuthors.push({
        login: a.login,
        slug,
        data: { login: a.login, display_name: a.displayName, first_name: a.firstName, last_name: a.lastName },
      });
    }
    if (missingAuthors.size) warnings.push(`Authors not in the export's author list (author_ref left empty): ${[...missingAuthors].sort().join(', ')}`);
  }

  const acf = planAcf(doc, entries, contentTypes, attachments, stats, warnings);

  const schemas: ImportPlan['schemas'] = {};
  if (options.authors) schemas[AUTHOR_TYPE] = AUTHOR_FIELDS.map((f) => ({ ...f }));
  for (const name of Object.keys(contentTypes)) {
    schemas[name] = [
      ...WP_FIELDS.map((f) => ({ ...f })),
      ...(options.categoryPaths ? [{ ...CATEGORY_PATHS_FIELD }] : []),
      ...(options.taxonomies && usedTaxonomyBy.has(name) ? [{ ...TAXONOMIES_FIELD }] : []),
      ...(options.authors ? [{ ...AUTHOR_REF_FIELD, options: { ...AUTHOR_REF_FIELD.options } }] : []),
      ...(acf.schemas[name] ?? []),
    ];
  }
  for (const [name, schema] of Object.entries(acf.optionsSchemas)) schemas[name] = schema;
  if (options.comments) {
    const targets = [...new Set(comments.map((c) => c.postContentType))].sort();
    schemas[COMMENT_TYPE] = commentFields(targets.length === 1 ? targets[0] : undefined);
    if (targets.length > 1) {
      warnings.push(
        `Comments belong to several content types (${targets.join(', ')}) — ${COMMENT_TYPE} gets no "post" relation; ` +
        'post_type + post_wp_id identify the post',
      );
    }
  }

  if (ignoredTaxonomies.size) {
    warnings.push(`Custom taxonomies are not imported: ${[...ignoredTaxonomies].sort().join(', ')}`);
  }

  return {
    site: { title: doc.title, link: doc.link, language: doc.language, version: doc.version },
    entries,
    attachments: [...attachments.values()],
    contentTypes,
    schemas,
    authors: plannedAuthors,
    comments,
    options,
    optionsPages: acf.optionsPages,
    stats,
    skipped,
    warnings,
  };
}

/** Field names the import itself uses on post types — an ACF field with one gets "acf_". */
const IMPORT_FIELD_NAMES = [...WP_FIELDS.map((f) => f.name), CATEGORY_PATHS_FIELD.name, TAXONOMIES_FIELD.name, AUTHOR_REF_FIELD.name];

/**
 * ACF fields for every planned entry (see acf.ts): adds them to the entries'
 * data, leaves the rest of the meta in `meta` (nested), and returns the extra
 * schema per content type plus content types for ACF options pages.
 */
function planAcf(
  doc: WxrDocument,
  entries: PlannedEntry[],
  contentTypes: Record<string, string>,
  attachments: Map<number, PlannedAttachment>,
  stats: PlanStats,
  warnings: string[],
): { schemas: Record<string, Record<string, unknown>[]>; optionsSchemas: Record<string, Record<string, unknown>[]>; optionsPages: ImportPlan['optionsPages'] } {
  const defs = readAcfDefinitions(doc.items);
  stats.acf.groups = defs.groups.length;
  const itemsById = new Map(doc.items.map((i) => [i.postId, i]));
  const imported = new Map(entries.map((e) => [e.wpId, e]));
  const importedTypeFor = (postType: string) => Object.keys(contentTypes).find((n) => contentTypes[n] === postType);

  const posts: ReadContext['posts'] = new Map();
  for (const item of doc.items) {
    const e = imported.get(item.postId);
    posts.set(item.postId, { postType: item.postType, title: item.title, slug: e?.slug ?? item.postName, contentType: e?.contentType });
  }
  const terms: ReadContext['terms'] = new Map();
  for (const c of doc.categories) if (c.id) terms.set(c.id, { name: c.name, slug: c.slug, taxonomy: 'category' });
  for (const t of doc.tags) if (t.id) terms.set(t.id, { name: t.name, slug: t.slug, taxonomy: 'post_tag' });
  for (const t of doc.terms) if (t.id) terms.set(t.id, { name: t.name, slug: t.slug, taxonomy: t.taxonomy });
  const users: ReadContext['users'] = new Map(doc.authors.filter((a) => a.id).map((a) => [a.id, { login: a.login, displayName: a.displayName }]));
  const attachmentsById: ReadContext['attachments'] = new Map([...attachments].map(([id, a]) => [id, { url: a.url, alt: a.alt }]));
  const issues: ReadContext['issues'] = { missingAttachments: new Set(), unknownLayouts: new Set() };
  const context = (meta: Record<string, string>, observe: boolean): ReadContext =>
    ({ meta, consumed: new Set(), containers: new Set(), attachments: attachmentsById, posts, terms, users, observe, issues });
  let leftovers = 0;

  const schemas: Record<string, Record<string, unknown>[]> = {};
  const usedGroups = new Set<string>();
  for (const name of Object.keys(contentTypes)) {
    const typeEntries = entries.filter((e) => e.contentType === name);
    const items = typeEntries.map((e) => itemsById.get(e.wpId)!).filter(Boolean);
    const groups = groupsForPostType(defs, contentTypes[name], items);
    groups.forEach((g) => usedGroups.add(g.key));
    const nodes: AcfNode[] = buildNodes(groups.flatMap((g) => g.fields), defs, 0, new Set(IMPORT_FIELD_NAMES));

    if (nodes.length) {
      for (const item of items) { const ctx = context(item.meta, true); for (const n of nodes) readNode(n, n.acf, ctx); }
      finalizeNodes(nodes, importedTypeFor);
      schemas[name] = nodeSchema(nodes);
      stats.acf.fields[name] = nodes.length;
    }
    for (const entry of typeEntries) {
      const item = itemsById.get(entry.wpId);
      if (!item) continue;
      const ctx = context(item.meta, false);
      for (const n of nodes) {
        const v = readNode(n, n.acf, ctx);
        if (v !== undefined) entry.data[n.name] = v;
      }
      // Keys in a repeater or flexible row that no field reads are values of deleted fields — ACF ignores them too.
      const inRow = (k: string) => [...ctx.containers].some((c) => k.startsWith(`${c}_`) && /^\d+_/.test(k.slice(c.length + 1)));
      const rest: Record<string, string> = {};
      for (const [k, v] of Object.entries(item.meta)) {
        if (ctx.consumed.has(k)) continue;
        if (inRow(k.replace(/^_/, ''))) { if (!k.startsWith('_')) leftovers++; continue; }
        rest[k] = v;
      }
      entry.data.meta = structureMeta(rest);
    }
  }

  // Options pages: global settings whose values live in wp_options, which exports leave out.
  const optionsSchemas: Record<string, Record<string, unknown>[]> = {};
  const optionsPages: ImportPlan['optionsPages'] = {};
  const taken = new Set([...Object.keys(contentTypes), AUTHOR_TYPE, COMMENT_TYPE]);
  const bySlug = new Map<string, typeof defs.groups>();
  for (const g of defs.groups) {
    if (usedGroups.has(g.key)) continue;
    for (const slug of g.optionsPages) bySlug.set(slug, [...(bySlug.get(slug) ?? []), g]);
  }
  for (const [slug, groups] of bySlug) {
    const nodes = buildNodes(groups.flatMap((g) => g.fields), defs, 0, new Set());
    if (!nodes.length) continue;
    finalizeNodes(nodes, importedTypeFor);
    let name = contentTypeNameFor(slug);
    if (taken.has(name)) name = `${name}_options`;
    for (let i = 2; taken.has(name); i++) name = `${contentTypeNameFor(slug)}_options_${i}`;
    taken.add(name);
    optionsSchemas[name] = nodeSchema(nodes);
    const title = groups.map((g) => g.title).join(' + ');
    optionsPages[name] = { title, slug };
    stats.acf.fields[name] = nodes.length;
    warnings.push(
      `ACF options page "${title}": WordPress exports don't include options page values — ` +
      `the content type "${name}" is created with its fields, ready to fill in`,
    );
  }

  if (leftovers) {
    warnings.push(`${leftovers} value(s) of ACF fields that were deleted from their field group are left out (ACF doesn't show them either)`);
  }
  if (issues.missingAttachments.size) {
    warnings.push(`ACF fields point at ${issues.missingAttachments.size} attachment(s) that are not in this export — those values are left empty`);
  }
  if (issues.unknownLayouts.size) {
    warnings.push(`Flexible content rows use layouts that no longer exist in the field group (${[...issues.unknownLayouts].sort().join(', ')}) — those rows are skipped`);
  }
  return { schemas, optionsSchemas, optionsPages };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pattern for an attachment URL and its resized copies ("photo-300x200.jpg" for "photo.jpg"), http or https. */
function attachmentUrlSource(url: string): string {
  const bare = url.replace(/^https?:\/\//, '');
  const dot = bare.lastIndexOf('.');
  const body = dot > bare.lastIndexOf('/')
    ? `${escapeRe(bare.slice(0, dot))}(?:-\\d+x\\d+)?${escapeRe(bare.slice(dot))}`
    : escapeRe(bare);
  return `https?://${body}`;
}

/**
 * A function that replaces attachment URLs in text with their new URLs —
 * including the resized copies WordPress links to, which all point at the one
 * imported original. One combined pattern, so a large site stays fast.
 */
export function mediaUrlRewriter(urlMap: Map<string, string>): (text: string) => string {
  if (urlMap.size === 0) return (text) => text;
  const byBare = new Map([...urlMap].map(([oldUrl, newUrl]) => [oldUrl.replace(/^https?:\/\//, ''), newUrl]));
  // Longest first, so "a/photo.jpg" doesn't stop short of "a/photo.jpg.webp".
  const sources = [...urlMap.keys()].sort((x, y) => y.length - x.length).map(attachmentUrlSource);
  const re = new RegExp(sources.join('|'), 'g');
  return (text) => {
    if (!text || !text.includes('://')) return text;
    return text.replace(re, (match) => {
      const bare = match.replace(/^https?:\/\//, '');
      return byBare.get(bare) ?? byBare.get(bare.replace(/-\d+x\d+(\.[^./]+)$/, '$1')) ?? match;
    });
  };
}

/** Replace attachment URLs in HTML with their new URLs (see mediaUrlRewriter). */
export function rewriteMediaUrls(html: string, urlMap: Map<string, string>): string {
  return mediaUrlRewriter(urlMap)(html);
}
