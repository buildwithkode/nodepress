import { readFileSync } from 'fs';
import { join } from 'path';
import { assertValidSlug } from '../common/slug-locale.util';
import {
  buildImportPlan, contentTypeNameFor, mapStatus, parseWxr, publicMeta, rewriteMediaUrls, slugify, wpDateToIso,
} from './wxr';

const fixture = readFileSync(join(__dirname, '../../test/fixtures/wordpress-sample.xml'), 'utf8');

describe('parseWxr', () => {
  const doc = parseWxr(fixture);

  it('reads the site, authors and terms', () => {
    expect(doc).toMatchObject({ title: 'Sample Coffee Blog', link: 'https://coffee.example.com', language: 'en-US', version: '1.2' });
    expect(doc.authors).toEqual([
      { login: 'jane', email: 'jane@coffee.example.com', displayName: 'Jane Barista' },
      { login: 'sam', email: 'sam@coffee.example.com', displayName: 'Sam Roaster' },
    ]);
    expect(doc.categories).toEqual([
      { slug: 'brewing', name: 'Brewing', parent: undefined },
      { slug: 'pour-over', name: 'Pour Over', parent: 'brewing' },
    ]);
    expect(doc.tags.map((t) => t.name)).toEqual(['V60', 'Espresso']);
  });

  it('reads items with content, terms and post meta', () => {
    expect(doc.items).toHaveLength(9);
    const post = doc.items.find((i) => i.postId === 11)!;
    expect(post).toMatchObject({
      title: 'How to brew the perfect V60', creator: 'jane', postName: 'perfect-v60', status: 'publish',
      postType: 'post', postDateGmt: '2025-01-14 07:30:00', excerpt: 'A slow, sweet cup in four minutes.',
      categories: ['Brewing', 'Pour Over'], tags: ['V60'],
    });
    expect(post.content).toContain('<p>Start with <strong>15 g</strong> of coffee &amp; 250 g of water.</p>');
    expect(post.meta).toEqual({ _edit_last: '1', _thumbnail_id: '10', brew_time: '4:00', _brew_time: 'field_65a1b2c3d4e5f' });
    const cpt = doc.items.find((i) => i.postId === 14)!;
    expect(cpt.otherTerms).toEqual({ origin: ['Africa'] });
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
      roast_level: 'light', tasting_notes: 'a:2:{i:0;s:7:"jasmine";i:1;s:5:"lemon";}',
    });
    expect(bySlug('espresso-basics').data.content).toBe('<p>Espresso is about pressure &#8212; and patience.</p>');
    expect(bySlug('espresso-basics').data.author).toBe('Sam Roaster');
  });

  it('collects attachments and warnings', () => {
    expect(plan.attachments).toEqual([{
      postId: 10, url: 'https://coffee.example.com/wp-content/uploads/2025/01/v60-grinder.png',
      title: 'V60 grinder', alt: 'A hand grinder next to a V60',
    }]);
    expect(plan.warnings).toEqual(['Custom taxonomies are not imported: origin']);
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

describe('helpers', () => {
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
