import { XmlElement, XmlParseError, childElements, childText, decodeEntities, firstChild, parseXml, textContent } from './xml';

describe('parseXml', () => {
  it('parses elements, attributes and text', () => {
    const root = parseXml('<?xml version="1.0"?><a x="1" y=\'two\'><b>hi</b><c/><b>there</b></a>');
    expect(root.name).toBe('a');
    expect(root.attrs).toEqual({ x: '1', y: 'two' });
    expect(childElements(root, 'b').map(textContent)).toEqual(['hi', 'there']);
    expect(firstChild(root, 'c')).toEqual({ name: 'c', attrs: {}, children: [] });
  });

  it('keeps namespace prefixes in names', () => {
    const root = parseXml('<rss xmlns:wp="http://wordpress.org/export/1.2/"><wp:post_id>12</wp:post_id></rss>');
    expect(root.attrs['xmlns:wp']).toBe('http://wordpress.org/export/1.2/');
    expect(childText(root, 'wp:post_id')).toBe('12');
  });

  it('returns CDATA verbatim — markup and entities are not interpreted', () => {
    const root = parseXml('<a><![CDATA[<p>Tom &amp; Jerry</p> <!-- not a comment --> ]]]]><![CDATA[>]]></a>');
    expect(textContent(root)).toBe('<p>Tom &amp; Jerry</p> <!-- not a comment --> ]]>');
  });

  it('merges text and CDATA into one text node', () => {
    const root = parseXml('<a>one <![CDATA[two]]> three</a>');
    expect(root.children).toEqual(['one two three']);
  });

  it('decodes the five predefined entities and numeric references', () => {
    const root = parseXml('<a t="&quot;q&quot; &amp; &apos;s&apos;">&lt;b&gt; &amp;amp; &#8212; &#x1F600; &#65;</a>');
    expect(root.attrs.t).toBe('"q" & \'s\'');
    expect(textContent(root)).toBe('<b> &amp; — 😀 A');
  });

  it('never expands other named entities', () => {
    expect(textContent(parseXml('<a>&nbsp;&copy;&xxe;</a>'))).toBe('&nbsp;&copy;&xxe;');
  });

  it('keeps invalid numeric references as written', () => {
    expect(decodeEntities('&#0; &#xD800; &#x110000;')).toBe('&#0; &#xD800; &#x110000;');
  });

  it('skips comments and processing instructions', () => {
    const root = parseXml('<!-- head --><?pi stuff?><a><!-- inside <b> --><?php echo 1; ?>x</a><!-- tail -->');
    expect(root.children).toEqual(['x']);
  });

  it('allows a bare DOCTYPE', () => {
    expect(parseXml('<!DOCTYPE rss><rss/>').name).toBe('rss');
  });

  it('rejects a DOCTYPE that declares entities (billion laughs)', () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<lolz>&lol2;</lolz>`;
    expect(() => parseXml(bomb)).toThrow(XmlParseError);
    expect(() => parseXml(bomb)).toThrow(/DOCTYPE/);
  });

  it('rejects an external entity (XXE)', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>';
    expect(() => parseXml(xxe)).toThrow(/DOCTYPE/);
    expect(() => parseXml('<!DOCTYPE foo SYSTEM "http://evil.test/x.dtd"><foo/>')).toThrow(/DOCTYPE/);
    expect(() => parseXml('<!DOCTYPE foo PUBLIC "-//x" "http://evil.test/x.dtd"><foo/>')).toThrow(/DOCTYPE/);
  });

  it('rejects other markup declarations', () => {
    expect(() => parseXml('<a><!ENTITY x "y"></a>')).toThrow(XmlParseError);
  });

  it('enforces the size limit', () => {
    expect(() => parseXml('<a>' + 'x'.repeat(100) + '</a>', { maxLength: 50 })).toThrow(/limit/);
  });

  it('enforces the depth limit', () => {
    const deep = '<a>'.repeat(20) + '</a>'.repeat(20);
    expect(() => parseXml(deep, { maxDepth: 10 })).toThrow(/deeper/);
    expect(parseXml(deep, { maxDepth: 20 }).name).toBe('a');
  });

  it.each([
    ['<a><b></a>', /Mismatched/],
    ['<a>', /Unclosed/],
    ['</a>', /Unexpected end tag/],
    ['<a></a><b></b>', /More than one root/],
    ['text<a/>', /outside the root/],
    ['<a x=1/>', /quoted/],
    ['<a x="1" x="2"/>', /Duplicate/],
    ['<a x="<"/>', /"<"/],
    ['<a><![CDATA[oops</a>', /CDATA/],
    ['<a><!-- oops</a>', /comment/],
    ['', /No root/],
    ['<1a/>', /Invalid tag/],
  ])('rejects malformed input %s', (input, message) => {
    expect(() => parseXml(input)).toThrow(message);
  });

  it('strips a byte order mark', () => {
    expect(parseXml('﻿<a/>').name).toBe('a');
  });

  it('parses a large flat document quickly', () => {
    const items = Array.from({ length: 20_000 }, (_, i) => `<item id="${i}"><![CDATA[<p>${i}</p>]]></item>`).join('');
    const started = Date.now();
    const root: XmlElement = parseXml(`<list>${items}</list>`);
    expect(childElements(root, 'item')).toHaveLength(20_000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
