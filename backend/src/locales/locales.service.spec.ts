import { BadRequestException } from '@nestjs/common';
import { validateLocales } from './locales.service';

describe('validateLocales', () => {
  it('dedupes and puts the default first', () => {
    expect(validateLocales({ locales: ['fr', 'en', 'fr', 'pt-BR'], defaultLocale: 'en' })).toEqual({
      defaultLocale: 'en',
      locales: ['en', 'fr', 'pt-BR'],
    });
  });

  it('defaults to the first language when no default is given', () => {
    expect(validateLocales({ locales: ['de', 'en'] }).defaultLocale).toBe('de');
  });

  it('rejects bad input', () => {
    expect(() => validateLocales({ locales: [] })).toThrow(BadRequestException);
    expect(() => validateLocales({ locales: 'en' as any })).toThrow(BadRequestException);
    expect(() => validateLocales({ locales: ['en', 'English'] })).toThrow(/Invalid language code/);
    expect(() => validateLocales({ locales: ['en', '../x'] })).toThrow(/Invalid language code/);
    expect(() => validateLocales({ locales: ['en'], defaultLocale: 'fr' })).toThrow(/default language/);
  });
});
