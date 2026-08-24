import { escapeCsvCell, entriesToCsv, parseCsvToEntries } from './csv.util';

describe('csv.util', () => {
  describe('escapeCsvCell()', () => {
    it('should return empty string for null and undefined', () => {
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('should leave simple strings untouched', () => {
      expect(escapeCsvCell('hello')).toBe('hello');
      expect(escapeCsvCell(123)).toBe('123');
    });

    it('should quote and escape strings with commas and quotes', () => {
      expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
      expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
      expect(escapeCsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    });

    it('should JSON-serialize objects and arrays', () => {
      expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"');
      expect(escapeCsvCell([1, 2, 3])).toBe('"[1,2,3]"');
    });
  });

  describe('entriesToCsv() & parseCsvToEntries() roundtrip', () => {
    const schema = [
      { name: 'title', label: 'Title' },
      { name: 'price', label: 'Price' },
      { name: 'tags', label: 'Tags' },
      { name: 'inStock', label: 'In Stock' },
    ];

    const entries = [
      {
        slug: 'laptop-pro',
        locale: 'en',
        status: 'published',
        publishAt: '2026-08-24T12:00:00.000Z',
        data: {
          title: 'Laptop Pro 16"',
          price: 1999.99,
          tags: ['hardware', 'apple'],
          inStock: true,
        },
      },
      {
        slug: 'mouse-wireless',
        locale: 'en',
        status: 'draft',
        publishAt: null,
        data: {
          title: 'Wireless, Ergonomic Mouse',
          price: 49.5,
          tags: ['accessory'],
          inStock: false,
        },
      },
    ];

    it('should serialize entries to RFC 4180 CSV', () => {
      const csv = entriesToCsv(entries, schema);
      expect(csv).toContain('slug,locale,status,publishAt,title,price,tags,inStock');
      expect(csv).toContain('laptop-pro,en,published');
      expect(csv).toContain('"Laptop Pro 16"""');
      expect(csv).toContain('"Wireless, Ergonomic Mouse"');
    });

    it('should parse generated CSV back to entry objects', () => {
      const csv = entriesToCsv(entries, schema);
      const parsed = parseCsvToEntries(csv);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].slug).toBe('laptop-pro');
      expect(parsed[0].status).toBe('published');
      expect(parsed[0].data.title).toBe('Laptop Pro 16"');
      expect(parsed[0].data.price).toBe(1999.99);
      expect(parsed[0].data.tags).toEqual(['hardware', 'apple']);
      expect(parsed[0].data.instock).toBe(true);

      expect(parsed[1].slug).toBe('mouse-wireless');
      expect(parsed[1].data.title).toBe('Wireless, Ergonomic Mouse');
      expect(parsed[1].data.price).toBe(49.5);
    });

    it('should handle empty or malformed CSV gracefully', () => {
      expect(parseCsvToEntries('')).toEqual([]);
      expect(parseCsvToEntries('   \n  ')).toEqual([]);
    });
  });
});
