import {
  assertStatus, csvCell, findChainProblems, normalizeFrom, normalizeTo, parseRedirectCsv, targetKey,
} from './redirect-path';
import { publicEntryPath } from './redirects.service';

describe('normalizeFrom', () => {
  it.each([
    ['old-page', '/old-page'],
    ['/Old-Page/', '/old-page'],
    ['//a///b//', '/a/b'],
    ['/', '/'],
    ['///', '/'],
    ['/a#section', '/a'],
    ['https://old.example.com/Blog/Post/?ref=X', '/blog/post?ref=X'],
    ['  /spaced  ', '/spaced'],
    ['/caf%C3%A9', '/caf%c3%a9'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeFrom(input)).toBe(expected);
  });

  it('keeps the query string (and its case) only when given', () => {
    expect(normalizeFrom('/a?Utm=1&b=2')).toBe('/a?Utm=1&b=2');
    expect(normalizeFrom('/a/?x')).toBe('/a?x');
  });

  it('rejects empty values, spaces and non-strings', () => {
    expect(() => normalizeFrom('')).toThrow(/required/);
    expect(() => normalizeFrom('/a b')).toThrow(/spaces/);
    expect(() => normalizeFrom(42)).toThrow();
    expect(() => normalizeFrom('/' + 'a'.repeat(3000))).toThrow(/at most/);
  });
});

describe('normalizeTo', () => {
  it('keeps absolute http(s) URLs as written', () => {
    expect(normalizeTo('https://Example.com/New?x=1#top', 301)).toBe('https://Example.com/New?x=1#top');
  });

  it('tidies paths but keeps their case, query and fragment', () => {
    expect(normalizeTo('New-Page/', 301)).toBe('/New-Page');
    expect(normalizeTo('/a//b/?q=1#h', 302)).toBe('/a/b?q=1#h');
  });

  it('refuses other schemes and protocol-relative URLs', () => {
    expect(() => normalizeTo('javascript:alert(1)', 301)).toThrow(/path or an http/);
    expect(() => normalizeTo('//evil.example/x', 301)).toThrow(/path or an http/);
    expect(() => normalizeTo('mailto:a@b.c', 301)).toThrow();
    expect(() => normalizeTo('/\\evil.example', 301)).toThrow(/path or an http/);
    expect(() => normalizeTo('/a\\b', 301)).toThrow(/backslashes/);
  });

  it('requires a target except for 410, which never has one', () => {
    expect(() => normalizeTo('', 301)).toThrow(/required/);
    expect(normalizeTo('/ignored', 410)).toBe('');
    expect(normalizeTo(undefined, 410)).toBe('');
  });

  it('targetKey matches a path target against froms, and ignores external URLs', () => {
    expect(targetKey('/New-Page?x=1#y')).toBe('/new-page?x=1');
    expect(targetKey('https://example.com/a')).toBeNull();
    expect(targetKey('')).toBeNull();
  });
});

describe('assertStatus', () => {
  it('accepts the redirect codes as numbers or strings', () => {
    expect(assertStatus(301)).toBe(301);
    expect(assertStatus('410')).toBe(410);
    expect(() => assertStatus(200)).toThrow(/301, 302, 307, 308, 410/);
    expect(() => assertStatus('abc')).toThrow();
  });
});

describe('findChainProblems', () => {
  const edges = (pairs: Array<[string, string]>) => pairs.map(([from, to]) => ({ from, to }));

  it('accepts a short chain and external targets', () => {
    const all = edges([['/a', '/b'], ['/b', '/c'], ['/c', 'https://x.example/']]);
    expect(findChainProblems(all, ['/a', '/b', '/c']).size).toBe(0);
  });

  it('finds a self redirect', () => {
    expect(findChainProblems(edges([['/a', '/A/']]), ['/a']).get('/a')).toMatch(/itself/);
  });

  it('finds loops A → B → A and longer ones', () => {
    expect(findChainProblems(edges([['/a', '/b'], ['/b', '/a']]), ['/b']).get('/b')).toMatch(/loop/);
    const three = edges([['/a', '/b'], ['/b', '/c'], ['/c', '/a']]);
    expect(findChainProblems(three, ['/c']).get('/c')).toMatch(/loop.*\/c → \/a → \/b → \/c/);
  });

  it('allows 5 hops and refuses 6, counting redirects before and after the changed one', () => {
    const five = edges([['/1', '/2'], ['/2', '/3'], ['/3', '/4'], ['/4', '/5'], ['/5', '/6']]);
    expect(findChainProblems(five, ['/3']).size).toBe(0);
    const six = [...five, { from: '/6', to: '/7' }];
    expect(findChainProblems(six, ['/6']).get('/6')).toMatch(/chain of 6/);
    // The new redirect is in the middle: 2 before it, 3 after it, itself.
    expect(findChainProblems(six, ['/3']).get('/3')).toMatch(/chain of 6/);
  });

  it('a query-string redirect is its own node', () => {
    const all = edges([['/a?x=1', '/a'], ['/a', '/b']]);
    expect(findChainProblems(all, ['/a?x=1']).size).toBe(0);
  });
});

describe('parseRedirectCsv', () => {
  it('reads rows with and without a header', () => {
    expect(parseRedirectCsv('/a,/b,302\n/c,/d\n')).toEqual([
      { line: 1, from: '/a', to: '/b', status: '302' },
      { line: 2, from: '/c', to: '/d', status: '' },
    ]);
    expect(parseRedirectCsv('to,from,status\r\n/new,/old,301\r\n')).toEqual([{ line: 2, from: '/old', to: '/new', status: '301' }]);
  });

  it('handles quotes, escaped quotes, commas, BOM, semicolons and blank lines', () => {
    const csv = '﻿from,to,status\n"/a,b","https://x.example/?q=""1""",301\n\n/gone,,410';
    expect(parseRedirectCsv(csv)).toEqual([
      { line: 2, from: '/a,b', to: 'https://x.example/?q="1"', status: '301' },
      { line: 4, from: '/gone', to: '', status: '410' },
    ]);
    expect(parseRedirectCsv('from;to;status\n/a;/b;308')).toEqual([{ line: 2, from: '/a', to: '/b', status: '308' }]);
  });

  it('ignores extra export columns', () => {
    const csv = 'from,to,status,hits,last_hit_at\n/a,/b,301,12,2026-01-01T00:00:00.000Z';
    expect(parseRedirectCsv(csv)).toEqual([{ line: 2, from: '/a', to: '/b', status: '301' }]);
  });

  it('reports an unclosed quote and a header without "to"', () => {
    expect(() => parseRedirectCsv('"/a,/b,301')).toThrow(/Unclosed quote/);
    expect(() => parseRedirectCsv('from,status\n/a,301')).toThrow(/"to" column/);
  });

  it('csvCell quotes when needed and defuses spreadsheet formulas', () => {
    expect(csvCell('/a')).toBe('/a');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
  });
});

describe('publicEntryPath', () => {
  it('defaults to /{type-in-kebab-case}/{slug}, with a locale prefix outside the default language', () => {
    expect(publicEntryPath({ name: 'blog_post' }, 'hello', 'en', 'en')).toBe('/blog-post/hello');
    expect(publicEntryPath({ name: 'blog_post' }, 'bonjour', 'fr', 'en')).toBe('/fr/blog-post/bonjour');
  });

  it('uses the path of the content type previewUrl when it contains {slug}', () => {
    const ct = { name: 'blog', previewUrl: 'https://site.example/{locale}/articles/{slug}?token={token}' };
    expect(publicEntryPath(ct, 'hello', 'de', 'en')).toBe('/de/articles/hello');
    // A preview endpoint that takes the slug as a query parameter says nothing about the public path.
    expect(publicEntryPath({ name: 'blog', previewUrl: 'https://site.example/api/draft?slug={slug}' }, 'x', 'en', 'en')).toBe('/blog/x');
  });
});
