import { sanitizeRichText, sanitizeEntryData } from './sanitize';

describe('sanitizeRichText()', () => {
  it('preserves safe HTML tags', () => {
    const input = '<h1>Title</h1><p>Hello <strong>world</strong></p>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('strips <script> tags entirely', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<p>Safe</p>');
  });

  it('strips javascript: href', () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('javascript:');
  });

  it('strips onerror and other event handlers', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('onerror');
  });

  it('adds target=_blank + rel=noopener to external links', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeRichText(input);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('does not modify internal anchor links', () => {
    const input = '<a href="#section">Section</a>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('target="_blank"');
  });

  it('allows img with safe attributes', () => {
    const input = '<img src="/uploads/img.jpg" alt="photo" width="800" height="600">';
    const result = sanitizeRichText(input);
    expect(result).toContain('src="/uploads/img.jpg"');
    expect(result).toContain('alt="photo"');
  });

  it('strips unknown tags', () => {
    const input = '<marquee>bad</marquee><p>good</p>';
    const result = sanitizeRichText(input);
    expect(result).not.toContain('<marquee>');
    expect(result).toContain('bad');  // text content preserved
    expect(result).toContain('<p>good</p>');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeRichText('')).toBe('');
  });
});

describe('sanitizeEntryData()', () => {
  const richtextSchema = [{ name: 'content', type: 'richtext' as const, required: false }];

  it('sanitizes a top-level richtext field', () => {
    const data = { content: '<p>Good</p><script>evil()</script>' };
    const result = sanitizeEntryData(data, richtextSchema);
    expect(result.content).not.toContain('<script>');
    expect(result.content).toContain('<p>Good</p>');
  });

  it('leaves non-richtext fields untouched', () => {
    const schema = [{ name: 'title', type: 'text' as const, required: true }];
    const data = { title: '<b>Not sanitized</b>' };
    const result = sanitizeEntryData(data, schema);
    expect(result.title).toBe('<b>Not sanitized</b>');
  });

  it('sanitizes richtext inside a repeater', () => {
    const schema = [{
      name: 'blocks',
      type: 'repeater' as const,
      required: false,
      options: {
        subFields: [{ name: 'body', type: 'richtext', required: false }],
        minItems: 0,
        maxItems: 10,
      },
    }];
    const data = {
      blocks: [
        { body: '<p>Safe</p><script>bad()</script>' },
      ],
    };
    const result = sanitizeEntryData(data as any, schema as any);
    expect(result.blocks[0].body).not.toContain('<script>');
    expect(result.blocks[0].body).toContain('<p>Safe</p>');
  });

  it('returns data unchanged when schema has no richtext fields', () => {
    const schema = [{ name: 'count', type: 'number' as const, required: false }];
    const data = { count: 42, extra: 'ignored' };
    const result = sanitizeEntryData(data, schema);
    expect(result).toEqual(data);
  });
});
