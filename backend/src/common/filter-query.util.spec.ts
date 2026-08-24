import {
  coerceValue,
  parseArrayValue,
  normalizeOperator,
  buildAdvancedWhere,
} from './filter-query.util';

describe('filter-query.util', () => {
  describe('coerceValue', () => {
    it('coerces boolean strings', () => {
      expect(coerceValue('true')).toBe(true);
      expect(coerceValue('false')).toBe(false);
    });

    it('coerces null strings', () => {
      expect(coerceValue('null')).toBeNull();
    });

    it('coerces integer and float numeric strings', () => {
      expect(coerceValue('100')).toBe(100);
      expect(coerceValue('-50.25')).toBe(-50.25);
      expect(coerceValue('0')).toBe(0);
    });

    it('preserves non-numeric strings', () => {
      expect(coerceValue('tech')).toBe('tech');
      expect(coerceValue('00123')).toBe('00123'); // Preserves leading zeros
    });
  });

  describe('parseArrayValue', () => {
    it('handles comma-separated string', () => {
      expect(parseArrayValue('news, tech, 100')).toEqual(['news', 'tech', 100]);
    });

    it('handles native array', () => {
      expect(parseArrayValue(['true', '123'])).toEqual([true, 123]);
    });
  });

  describe('normalizeOperator', () => {
    it('normalizes common aliases', () => {
      expect(normalizeOperator('$gte')).toBe('gte');
      expect(normalizeOperator('greater_than_or_equal')).toBe('gte');
      expect(normalizeOperator('$in')).toBe('in');
      expect(normalizeOperator('nin')).toBe('notIn');
      expect(normalizeOperator('$contains')).toBe('contains');
      expect(normalizeOperator('like')).toBe('contains');
    });
  });

  describe('buildAdvancedWhere', () => {
    it('builds conditions for top-level columns', () => {
      const result = buildAdvancedWhere({
        slug: { startsWith: 'blog-' },
        status: { eq: 'published' },
        createdAt: { gte: '2026-01-01' },
      });

      expect(result).toContainEqual({ slug: { startsWith: 'blog-', mode: 'insensitive' } });
      expect(result).toContainEqual({ status: 'published' });
      expect(result).toContainEqual({ createdAt: { gte: '2026-01-01' } });
    });

    it('builds conditions for dynamic JSON data fields', () => {
      const result = buildAdvancedWhere({
        price: { gte: '100', lte: '500' },
        featured: { eq: 'true' },
        category: { in: 'tech,news' },
      });

      expect(result).toContainEqual({ data: { path: ['price'], gte: 100 } });
      expect(result).toContainEqual({ data: { path: ['price'], lte: 500 } });
      expect(result).toContainEqual({ data: { path: ['featured'], equals: true } });
      expect(result).toContainEqual({
        OR: [
          { data: { path: ['category'], equals: 'tech' } },
          { data: { path: ['category'], equals: 'news' } },
        ],
      });
    });

    it('supports OR combinator', () => {
      const result = buildAdvancedWhere({
        OR: [
          { category: { eq: 'tech' } },
          { price: { lt: '50' } },
        ],
      });

      expect(result).toEqual([
        {
          OR: [
            { data: { path: ['category'], equals: 'tech' } },
            { data: { path: ['price'], lt: 50 } },
          ],
        },
      ]);
    });

    it('supports AND combinator', () => {
      const result = buildAdvancedWhere({
        AND: [
          { category: { eq: 'tech' } },
          { featured: { eq: 'true' } },
        ],
      });

      expect(result).toContainEqual({ data: { path: ['category'], equals: 'tech' } });
      expect(result).toContainEqual({ data: { path: ['featured'], equals: true } });
    });

    it('supports direct scalar values in where', () => {
      const result = buildAdvancedWhere({
        category: 'tech',
        featured: 'true',
      });

      expect(result).toContainEqual({ data: { path: ['category'], equals: 'tech' } });
      expect(result).toContainEqual({ data: { path: ['featured'], equals: true } });
    });

    it('supports legacy filter parameter compatibility', () => {
      const result = buildAdvancedWhere(undefined, {
        author: 'john',
      });

      expect(result).toContainEqual({
        data: {
          path: ['author'],
          string_contains: 'john',
        },
      });
    });
  });
});
