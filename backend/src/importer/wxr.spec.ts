import { readFileSync } from 'fs';
import { join } from 'path';
import { assertValidSlug } from '../common/slug-locale.util';
import {
  AUTHOR_TYPE, COMMENT_TYPE, buildImportPlan, mediaUrlRewriter, contentTypeNameFor, mapStatus, parseWxr, publicMeta, rewriteMediaUrls,
  slugify, stripHtml, wpDateToIso,
} from './wxr';

const fixture = readFileSync(join(__dirname, '../../test/fixtures/wordpress-sample.xml'), 'utf8');
const acfFixture = readFileSync(join(__dirname, '../../test/fixtures/wordpress-acf.xml'), 'utf8');

describe('parseWxr', () => {
  const doc = parseWxr(fixture);

  it('reads the site, authors and terms', () => {
    expect(doc).toMatchObject({ title: 'Sample Coffee Blog', link: 'https://coffee.example.com', language: 'en-US', version: '1.2' });
    expect(doc.authors).toEqual([
      { id: 1, login: 'jane', email: 'jane@coffee.example.com', displayName: 'Jane Barista', firstName: 'Jane', lastName: 'Barista' },
      { id: 2, login: 'sam', email: 'sam@coffee.example.com', displayName: 'Sam Roaster', firstName: '', lastName: '' },
    ]);
    expect(doc.categories).toEqual([
      { id: 2, slug: 'brewing', name: 'Brewing', parent: undefined },
      { id: 3, slug: 'pour-over', name: 'Pour Over', parent: 'brewing' },
      { id: 6, slug: 'kettles', name: 'Kettles', parent: 'pour-over' },
    ]);
    expect(doc.tags.map((t) => t.name)).toEqual(['V60', 'Espresso']);
    expect(doc.terms).toEqual([
      { id: 7, taxonomy: 'origin', slug: 'africa', name: 'Africa', parent: undefined },
      { id: 8, taxonomy: 'origin', slug: 'ethiopia', name: 'Ethiopia', parent: 'africa' },
      { id: 9, taxonomy: 'nav_menu', slug: 'main-menu', name: 'Main menu', parent: undefined },
    ]);
  });

  it('reads items with content, terms and post meta', () => {
    expect(doc.items).toHaveLength(9);
    const post = doc.items.find((i) => i.postId === 11)!;
    expect(post).toMatchObject({
      title: 'How to brew the perfect V60', creator: 'jane', postName: 'perfect-v60', status: 'publish',
      postType: 'post', postDateGmt: '2025-01-14 07:30:00', excerpt: 'A slow, sweet cup in four minutes.',
      categories: ['Brewing', 'Pour Over'], categorySlugs: ['brewing', 'pour-over'], tags: ['V60'],
    });
    expect(post.content).toContain('<p>Start with <strong>15 g</strong> of coffee &amp; 250 g of water.</p>');
    expect(post.meta).toEqual({ _edit_last: '1', _thumbnail_id: '10', brew_time: '4:00', _brew_time: 'field_65a1b2c3d4e5f' });
    const cpt = doc.items.find((i) => i.postId === 14)!;
    expect(cpt.otherTerms).toEqual({ origin: ['Africa', 'Ethiopia'] });
  });

  it('reads comments without the commenter\'s email, URL or IP', () => {
    const post = doc.items.find((i) => i.postId === 11)!;
    expect(post.comments.map((c) => [c.id, c.approved, c.parent])).toEqual([[1, '1', 0], [2, '1', 1], [3, '0', 0], [4, 'spam', 0]]);
    expect(post.comments[0]).toEqual({
      id: 1, author: 'A reader', date: '2025-01-15 10:00:00', dateGmt: '2025-01-15 09:00:00',
      content: 'Great guide!', approved: '1', type: 'comment', parent: 0,
    });
    expect(JSON.stringify(doc.items.map((i) => i.comments))).not.toMatch(/@|203\.0\.113|reader\.example/);
  });

  it('rejects files that are not WordPress exports', () => {
    expect(() => parseWxr('<html><body/></html>')).toThrow(/root element is <html>/);
    expect(() => parseWxr('<rss><channel><title>x</title></channel></rss>')).toThrow(/wxr_version/);
    expect(() => parseWxr('<rss/>')).toThrow(/channel/);
  });
});

describe('buildImportPlan', () => {
  const plan = buildImportPlan(parseWxr(fixture));
  const bySlug = (slug: string) => plan.entries.find((e) => e.slug === slug)!;

  it('maps post types to content types and skips WordPress internals', () => {
    expect(plan.contentTypes).toEqual({ post: 'post', page: 'page', coffee_bean: 'coffee_bean' });
    expect(plan.entries.map((e) => `${e.contentType}/${e.slug}`)).toEqual([
      'post/perfect-v60', 'post/espresso-basics', 'post/cold-brew-experiments', 'page/about',
      'coffee_bean/ethiopia-yirgacheffe', 'post/summer-menu',
    ]);
    expect(plan.skipped).toEqual({ 'status:trash': 1, 'type:nav_menu_item': 1 });
  });

  it('maps statuses and dates', () => {
    expect(bySlug('perfect-v60')).toMatchObject({ status: 'published', date: '2025-01-14T07:30:00.000Z', publishAt: undefined });
    // Draft without a GMT date falls back to the local post date; no post_name → slug from the title.
    expect(bySlug('cold-brew-experiments')).toMatchObject({ status: 'draft', wpStatus: 'draft', date: '2025-03-02T12:00:00.000Z' });
    expect(bySlug('summer-menu')).toMatchObject({ status: 'draft', wpStatus: 'future', publishAt: '2031-06-01T08:00:00.000Z' });
  });

  it('fills the entry fields', () => {
    expect(bySlug('perfect-v60').data).toMatchObject({
      title: 'How to brew the perfect V60',
      excerpt: 'A slow, sweet cup in four minutes.',
      featured_image: { url: 'https://coffee.example.com/wp-content/uploads/2025/01/v60-grinder.png', alt: 'A hand grinder next to a V60' },
      categories: ['Brewing', 'Pour Over'],
      tags: ['V60'],
      author: 'Jane Barista',
      wp_id: 11,
      meta: { brew_time: '4:00' }, // ACF value kept, "_brew_time" field key and _thumbnail_id dropped
    });
    expect(bySlug('perfect-v60').featuredAttachmentId).toBe(10);
    expect(bySlug('ethiopia-yirgacheffe').data.meta).toEqual({
      roast_level: 'light', tasting_notes: ['jasmine', 'lemon'], // serialized PHP, read
    });
    expect(bySlug('espresso-basics').data.content).toBe('<p>Espresso is about pressure &#8212; and patience.</p>');
    expect(bySlug('espresso-basics').data.author).toBe('Sam Roaster');
  });

  it('collects attachments and warnings', () => {
    expect(plan.attachments).toEqual([{
      postId: 10, url: 'https://coffee.example.com/wp-content/uploads/2025/01/v60-grinder.png',
      title: 'V60 grinder', alt: 'A hand grinder next to a V60',
    }]);
    expect(plan.warnings).toEqual(['Custom taxonomies are not imported: origin']); // post_format isn't a custom taxonomy
  });

  it('adds none of the optional extras by default', () => {
    expect(plan.options).toEqual({ categoryPaths: false, taxonomies: false, authors: false, comments: false, pendingComments: false });
    expect(Object.keys(plan.schemas)).toEqual(['post', 'page', 'coffee_bean']);
    expect(plan.schemas.post.map((f) => f.name)).not.toContain('category_paths');
    expect(plan.authors).toEqual([]);
    expect(plan.comments).toEqual([]);
    expect(bySlug('ethiopia-yirgacheffe').data).not.toHaveProperty('taxonomies');
    expect(bySlug('perfect-v60').authorLogin).toBeUndefined();
    // …but the dry run still learns what the file holds.
    expect(plan.stats).toEqual({
      nestedCategories: 2, taxonomies: { origin: 1 }, authors: 2, acf: { groups: 0, fields: {} },
      comments: { approved: 2, pending: 1, spam: 1, trash: 1, other: 0 },
    });
  });

  it('only produces valid slugs', () => {
    for (const e of plan.entries) expect(() => assertValidSlug(e.slug)).not.toThrow();
  });

  it('de-duplicates slugs inside one file and warns about missing featured images', () => {
    const xml = `<rss><channel><wp:wxr_version>1.2</wp:wxr_version>
      <item><title>Same</title><wp:post_id>1</wp:post_id><wp:status>draft</wp:status><wp:post_type>post</wp:post_type></item>
      <item><title>Same</title><wp:post_id>2</wp:post_id><wp:status>draft</wp:status><wp:post_type>post</wp:post_type>
        <wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>99</wp:meta_value></wp:postmeta></item>
      <item><title></title><wp:post_id>3</wp:post_id><wp:status>publish</wp:status><wp:post_type>My-Thing</wp:post_type></item>
      <item><title>Locked</title><wp:post_id>4</wp:post_id><wp:status>private</wp:status><wp:post_type>media</wp:post_type></item>
    </channel></rss>`;
    const p = buildImportPlan(parseWxr(xml));
    expect(p.entries.map((e) => `${e.contentType}/${e.slug}/${e.status}`)).toEqual([
      'post/same/draft', 'post/same-2/draft', 'my_thing/my-thing-3/published', 'wp_media/locked/draft',
    ]);
    expect(p.entries[2].data.title).toBe('my-thing-3');
    expect(p.warnings).toEqual([
      'post #2: slug "same" is used twice in this file — imported as "same-2"',
      'post #2: featured image (attachment #99) is not in this export',
    ]);
  });
});

describe('buildImportPlan options', () => {
  const doc = parseWxr(fixture);
  const all = buildImportPlan(doc, { categoryPaths: true, taxonomies: true, authors: true, comments: true });
  const bySlug = (slug: string) => all.entries.find((e) => e.slug === slug)!;

  it('categoryPaths: full paths from the parent links, names unchanged', () => {
    expect(bySlug('perfect-v60').data).toMatchObject({ categories: ['Brewing', 'Pour Over'], category_paths: ['Brewing', 'Brewing/Pour Over'] });
    expect(bySlug('summer-menu').data).toMatchObject({ categories: ['Kettles'], category_paths: ['Brewing/Pour Over/Kettles'], tags: [] });
    expect(bySlug('about').data.category_paths).toEqual([]);
    expect(all.schemas.post.map((f) => f.name)).toContain('category_paths');
  });

  it('categoryPaths: survives parent loops and categories missing from the channel', () => {
    const xml = `<rss><channel><wp:wxr_version>1.2</wp:wxr_version>
      <wp:category><wp:category_nicename>a</wp:category_nicename><wp:category_parent>b</wp:category_parent><wp:cat_name>A</wp:cat_name></wp:category>
      <wp:category><wp:category_nicename>b</wp:category_nicename><wp:category_parent>a</wp:category_parent><wp:cat_name>B</wp:cat_name></wp:category>
      <item><title>X</title><wp:post_id>1</wp:post_id><wp:status>publish</wp:status><wp:post_type>post</wp:post_type>
        <category domain="category" nicename="a">A</category><category domain="category">Loose</category></item>
    </channel></rss>`;
    expect(buildImportPlan(parseWxr(xml), { categoryPaths: true }).entries[0].data.category_paths).toEqual(['B/A', 'Loose']);
  });

  it('taxonomies: a taxonomies field on the entries (and types) that use them, and no warning', () => {
    expect(bySlug('ethiopia-yirgacheffe').data.taxonomies).toEqual({ origin: ['Africa', 'Ethiopia'] });
    expect(bySlug('espresso-basics').data).not.toHaveProperty('taxonomies'); // post_format is left out
    expect(all.schemas.coffee_bean.map((f) => f.name)).toContain('taxonomies');
    expect(all.schemas.post.map((f) => f.name)).not.toContain('taxonomies');
    expect(all.warnings).toEqual([]);
  });

  it('authors: wp_author entries without email, and author_ref on posts', () => {
    expect(all.authors).toEqual([
      { login: 'jane', slug: 'jane', data: { login: 'jane', display_name: 'Jane Barista', first_name: 'Jane', last_name: 'Barista' } },
      { login: 'sam', slug: 'sam', data: { login: 'sam', display_name: 'Sam Roaster', first_name: '', last_name: '' } },
    ]);
    expect(JSON.stringify(all.authors)).not.toContain('@');
    expect(all.schemas[AUTHOR_TYPE].map((f) => f.name)).toEqual(['login', 'display_name', 'first_name', 'last_name']);
    expect(Object.keys(all.schemas)[0]).toBe(AUTHOR_TYPE); // created before the types that point at it
    expect(bySlug('espresso-basics')).toMatchObject({ authorLogin: 'sam', data: { author: 'Sam Roaster' } });
    expect(all.schemas.page.find((f) => f.name === 'author_ref')).toMatchObject({
      type: 'relation', options: { relatedContentType: AUTHOR_TYPE, cardinality: 'one' },
    });
  });

  it('authors: unknown creators are warned about, odd logins get valid slugs', () => {
    const xml = `<rss><channel><wp:wxr_version>1.2</wp:wxr_version>
      <wp:author><wp:author_login>Mr.Smith@Home</wp:author_login></wp:author>
      <wp:author><wp:author_login>mr-smith-home</wp:author_login></wp:author>
      <item><title>X</title><dc:creator>ghost</dc:creator><wp:post_id>1</wp:post_id><wp:status>publish</wp:status><wp:post_type>post</wp:post_type></item>
    </channel></rss>`;
    const p = buildImportPlan(parseWxr(xml), { authors: true });
    expect(p.authors.map((a) => a.slug)).toEqual(['mr-smith-home', 'mr-smith-home-2']);
    for (const a of p.authors) expect(() => assertValidSlug(a.slug)).not.toThrow();
    expect(p.entries[0].authorLogin).toBeUndefined();
    expect(p.warnings).toEqual(["Authors not in the export's author list (author_ref left empty): ghost"]);
  });

  it('comments: approved only, never spam or trash, HTML stripped, threaded replies kept', () => {
    expect(all.comments.map((c) => [c.slug, c.status, c.data.parent_wp_id])).toEqual([
      ['comment-1', 'published', 0], ['comment-2', 'published', 1],
    ]);
    expect(all.comments[1]).toMatchObject({
      date: '2025-01-15T10:30:00.000Z',
      postContentType: 'post',
      data: {
        author_name: 'Jane Barista', content: 'Thanks! Try 94 °C water & a slow pour.\nSecond line\nthird',
        date: '2025-01-15T10:30:00.000Z', post_wp_id: 11, post_type: 'post', wp_id: 2,
      },
    });
    expect(all.skipped).toMatchObject({ 'comment:pending': 1, 'comment:spam': 1, 'comment:trash': 1, 'comment:post_not_imported': 1 });
    expect(all.schemas[COMMENT_TYPE].find((f) => f.name === 'post')).toMatchObject({
      type: 'relation', options: { relatedContentType: 'post', cardinality: 'one' },
    });
    expect(Object.keys(all.schemas).pop()).toBe(COMMENT_TYPE);
  });

  it('comments: pending ones on request (as pending_review)', () => {
    const p = buildImportPlan(doc, { comments: true, pendingComments: true });
    expect(p.comments.map((c) => `${c.slug}:${c.status}`)).toEqual(['comment-1:published', 'comment-2:published', 'comment-3:pending_review']);
    expect(p.skipped).not.toHaveProperty('comment:pending');
    // pendingComments alone does nothing
    expect(buildImportPlan(doc, { pendingComments: true }).comments).toEqual([]);
  });

  it('comments on several content types: no post relation, a warning instead', () => {
    const xml = `<rss><channel><wp:wxr_version>1.2</wp:wxr_version>
      <item><title>P</title><wp:post_id>1</wp:post_id><wp:status>publish</wp:status><wp:post_type>post</wp:post_type>
        <wp:comment><wp:comment_id>9</wp:comment_id><wp:comment_content>a</wp:comment_content><wp:comment_approved>1</wp:comment_approved></wp:comment></item>
      <item><title>Q</title><wp:post_id>2</wp:post_id><wp:status>publish</wp:status><wp:post_type>page</wp:post_type>
        <wp:comment><wp:comment_id>10</wp:comment_id><wp:comment_content>b</wp:comment_content><wp:comment_approved>1</wp:comment_approved></wp:comment>
        <wp:comment><wp:comment_id>11</wp:comment_id><wp:comment_type>pingback</wp:comment_type><wp:comment_approved>1</wp:comment_approved></wp:comment></item>
    </channel></rss>`;
    const p = buildImportPlan(parseWxr(xml), { comments: true });
    expect(p.comments.map((c) => c.slug)).toEqual(['comment-9', 'comment-10']);
    expect(p.schemas[COMMENT_TYPE].map((f) => f.name)).not.toContain('post');
    expect(p.skipped).toEqual({ 'comment:pingback': 1 });
    expect(p.warnings[0]).toMatch(/several content types \(page, post\)/);
  });
});

describe('helpers', () => {
  it('stripHtml', () => {
    expect(stripHtml('<p>a &amp; b</p><p>c<br>d</p>')).toBe('a & b\nc\nd');
    expect(stripHtml('x<script>alert(1)</script><style>p{}</style> &hellip; &unknown; &amp;lt;')).toBe('x … &unknown; &lt;');
  });

  it('slugify', () => {
    expect(slugify('Café Crème — Ünïcode!')).toBe('cafe-creme-unicode');
    expect(slugify('%e6%97%a5%e6%9c%ac')).toBe(''); // non-Latin post_name → caller falls back
    expect(slugify('caf%C3%A9-au-lait')).toBe('cafe-au-lait');
    expect(slugify('--a__b--')).toBe('a-b');
    expect(slugify('%zz bad encoding')).toBe('zz-bad-encoding');
    expect(slugify('x'.repeat(250)).length).toBe(200);
  });

  it('contentTypeNameFor', () => {
    expect(contentTypeNameFor('post')).toBe('post');
    expect(contentTypeNameFor('coffee-bean')).toBe('coffee_bean');
    expect(contentTypeNameFor('uploads')).toBe('wp_uploads');
    expect(contentTypeNameFor('import')).toBe('wp_import');
  });

  it('mapStatus', () => {
    expect(['publish', 'draft', 'pending', 'future', 'private', 'trash', 'weird'].map(mapStatus))
      .toEqual(['published', 'draft', 'pending_review', 'draft', 'draft', null, null]);
  });

  it('wpDateToIso', () => {
    expect(wpDateToIso('2025-01-14 07:30:00')).toBe('2025-01-14T07:30:00.000Z');
    expect(wpDateToIso('0000-00-00 00:00:00')).toBeUndefined();
    expect(wpDateToIso('yesterday')).toBeUndefined();
  });

  it('publicMeta keeps only keys without a leading underscore', () => {
    expect(publicMeta({ _edit_lock: '1', price: '9', _price: 'field_x' })).toEqual({ price: '9' });
  });

  it('rewriteMediaUrls replaces originals and resized copies, http or https', () => {
    const map = new Map([['https://old.test/wp-content/uploads/2025/01/a.png', 'https://cdn.test/new-a.png']]);
    const html = '<img src="https://old.test/wp-content/uploads/2025/01/a-300x200.png">'
      + '<a href="http://old.test/wp-content/uploads/2025/01/a.png">x</a>'
      + '<img src="https://old.test/wp-content/uploads/2025/01/ab.png">';
    expect(rewriteMediaUrls(html, map)).toBe(
      '<img src="https://cdn.test/new-a.png"><a href="https://cdn.test/new-a.png">x</a>'
      + '<img src="https://old.test/wp-content/uploads/2025/01/ab.png">',
    );
    expect(rewriteMediaUrls('$& https://old.test/wp-content/uploads/2025/01/a.png', new Map([[
      'https://old.test/wp-content/uploads/2025/01/a.png', 'https://x.test/$&.png',
    ]]))).toBe('$& https://x.test/$&.png');
  });
});

describe('buildImportPlan with ACF', () => {
  const plan = buildImportPlan(parseWxr(acfFixture));
  const home = plan.entries.find((e) => e.slug === 'home')!;

  it('turns field groups into fields, and options pages into their own types', () => {
    expect(Object.keys(plan.schemas)).toEqual(['post', 'page', 'site_settings']);
    const page = plan.schemas.page as any[];
    expect(page.slice(-6).map((f) => [f.name, f.type])).toEqual([
      ['hero_title', 'text'], ['hero_image', 'image'], ['cta', 'group'], ['theme', 'select'],
      ['featured_post', 'relation'], ['sections', 'flexible'],
    ]);
    const sections = page.find((f) => f.name === 'sections');
    expect(sections.options.layouts[1].fields[0]).toMatchObject({ name: 'items', type: 'repeater' });
    expect(sections.options.layouts[2].fields).toHaveLength(1); // an empty layout gets a placeholder field
    expect(plan.optionsPages).toEqual({ site_settings: { title: 'Site Settings', slug: 'site-settings' } });
    expect(plan.stats.acf).toEqual({ groups: 2, fields: { page: 6, site_settings: 1 } });
  });

  it('reads flat post meta into nested values', () => {
    expect(home.data).toMatchObject({
      hero_image: { url: 'https://studio.example.com/wp-content/uploads/2026/10/hero.jpg', alt: 'Studio at night' },
      cta: { title: 'Get in touch', url: 'https://studio.example.com/contact/?ref=home&utm=1' },
      theme: 'dark',
      featured_post: { __wp_ref: [50] },
      sections: [
        { _layout: 'text_block' },
        { _layout: 'feature_list', items: [{ label: 'Fast', highlight: true }, { label: 'Friendly', highlight: false }] },
        { _layout: 'divider' },
      ],
      meta: {},
    });
    expect(JSON.stringify(home.data)).not.toContain('stale');
  });
});

describe('mediaUrlRewriter', () => {
  it('rewrites many URLs in one pass, longest match first', () => {
    const rewrite = mediaUrlRewriter(new Map([
      ['https://old.test/u/a.jpg', '/uploads/1.jpg'],
      ['https://old.test/u/a.jpg.webp', '/uploads/2.webp'],
    ]));
    expect(rewrite('x https://old.test/u/a.jpg.webp y http://old.test/u/a-150x150.jpg')).toBe('x /uploads/2.webp y /uploads/1.jpg');
    expect(mediaUrlRewriter(new Map())('https://old.test/u/a.jpg')).toBe('https://old.test/u/a.jpg');
  });
});
