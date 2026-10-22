import { ValidationPipe } from '@nestjs/common';
import { normalizePreviewUrl, PREVIEW_URL_MAX_LENGTH } from './preview-url';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';

// Same options as main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe('normalizePreviewUrl', () => {
  it('keeps http(s) templates with placeholders', () => {
    expect(normalizePreviewUrl(' https://site.example/blog/{slug}?token={token}&lang={locale} '))
      .toBe('https://site.example/blog/{slug}?token={token}&lang={locale}');
    expect(normalizePreviewUrl('http://localhost:4321/preview')).toBe('http://localhost:4321/preview');
  });

  it('clears on empty, null or undefined', () => {
    expect(normalizePreviewUrl('')).toBeNull();
    expect(normalizePreviewUrl('   ')).toBeNull();
    expect(normalizePreviewUrl(null)).toBeNull();
    expect(normalizePreviewUrl(undefined)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'ftp://site.example/{slug}',
    '/blog/{slug}',
    'not a url',
    'https://{slug}.site.example/',
    'https://site.example{slug}/',
  ])('rejects %s', (value) => {
    expect(() => normalizePreviewUrl(value)).toThrow();
  });

  it('rejects overlong templates and non-strings', () => {
    expect(() => normalizePreviewUrl(`https://site.example/${'a'.repeat(PREVIEW_URL_MAX_LENGTH)}`)).toThrow();
    expect(() => normalizePreviewUrl(42)).toThrow();
  });
});

describe('previewUrl in the content type DTOs', () => {
  const create = (body: any) => pipe.transform(body, { type: 'body', metatype: CreateContentTypeDto });
  const update = (body: any) => pipe.transform(body, { type: 'body', metatype: UpdateContentTypeDto });

  it('accepts a template, an empty string and null', async () => {
    await expect(create({ name: 'blog', schema: [], previewUrl: 'https://site.example/{slug}' })).resolves.toBeDefined();
    await expect(update({ previewUrl: '' })).resolves.toBeDefined();
    await expect(update({ previewUrl: null })).resolves.toBeDefined();
  });

  it('rejects other schemes and overlong values', async () => {
    await expect(create({ name: 'blog', schema: [], previewUrl: 'javascript:alert(1)' })).rejects.toThrow();
    await expect(update({ previewUrl: `https://x.example/${'a'.repeat(PREVIEW_URL_MAX_LENGTH)}` })).rejects.toThrow();
  });
});
