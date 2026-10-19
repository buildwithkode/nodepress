import { BadRequestException } from '@nestjs/common';
import { assertValidSlug, canonicalLocale } from './slug-locale.util';

describe('slug & locale validation', () => {
  it('accepts URL-safe slugs', () => {
    for (const s of ['hello', 'my-first-post', 'post_2', 'a1-b2_c3']) expect(assertValidSlug(s)).toBe(s);
  });

  it('rejects slugs that would break URLs', () => {
    for (const s of ['', 'Hello', 'about en About', 'a/b', 'a?b', '-lead', 'trail-', 'double--dash', 'x'.repeat(201), 42])
      expect(() => assertValidSlug(s)).toThrow(BadRequestException);
  });

  it('canonicalizes locales and defaults blanks', () => {
    expect(canonicalLocale('EN')).toBe('en');
    expect(canonicalLocale('pt-br')).toBe('pt-BR');
    expect(canonicalLocale('zh-hant')).toBe('zh-Hant');
    expect(canonicalLocale('', 'fr')).toBe('fr');
    expect(canonicalLocale(undefined)).toBe('en');
  });

  it('rejects things that are not language tags', () => {
    for (const l of ['english', 'en_US!', '../x', '12']) expect(() => canonicalLocale(l)).toThrow(BadRequestException);
  });
});
