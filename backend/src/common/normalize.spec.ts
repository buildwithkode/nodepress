import {
  normalizeKey,
  normalizeDataKeys,
  needsRepeaterIds,
  injectRepeaterIds,
} from './normalize';

describe('normalizeKey()', () => {
  it('converts spaces to underscores', () => {
    expect(normalizeKey('My Field')).toBe('my_field');
  });

  it('converts hyphens to underscores', () => {
    expect(normalizeKey('first-name')).toBe('first_name');
  });

  it('lowercases', () => {
    expect(normalizeKey('Title')).toBe('title');
  });

  it('trims whitespace', () => {
    expect(normalizeKey('  slug  ')).toBe('slug');
  });

  it('handles mixed case + spaces + hyphens', () => {
    expect(normalizeKey('Featured Image URL')).toBe('featured_image_url');
  });

  it('leaves already normalized keys alone', () => {
    expect(normalizeKey('body_text')).toBe('body_text');
  });
});

describe('normalizeDataKeys()', () => {
  it('normalizes top-level keys', () => {
    const result = normalizeDataKeys({ 'My Title': 'Hello', 'body-text': 'World' });
    expect(result).toHaveProperty('my_title', 'Hello');
    expect(result).toHaveProperty('body_text', 'World');
  });

  it('recursively normalizes nested object keys', () => {
    const result = normalizeDataKeys({ 'Outer Key': { 'Inner Key': 1 } });
    expect(result.outer_key.inner_key).toBe(1);
  });

  it('normalizes keys inside arrays of objects', () => {
    const result = normalizeDataKeys({ items: [{ 'Item Name': 'A' }] });
    expect(result.items[0].item_name).toBe('A');
  });

  it('leaves primitive array items untouched', () => {
    const result = normalizeDataKeys({ tags: ['alpha', 'beta'] });
    expect(result.tags).toEqual(['alpha', 'beta']);
  });
});

describe('needsRepeaterIds()', () => {
  it('returns false for plain scalar data', () => {
    expect(needsRepeaterIds({ title: 'Hello', count: 1 })).toBe(false);
  });

  it('returns true when an array-of-objects item has no _id', () => {
    const data = { items: [{ name: 'A' }] };
    expect(needsRepeaterIds(data)).toBe(true);
  });

  it('returns false when all array-of-objects items have _id', () => {
    const data = { items: [{ _id: 'abc123', name: 'A' }] };
    expect(needsRepeaterIds(data)).toBe(false);
  });

  it('returns false for primitive arrays', () => {
    const data = { tags: ['a', 'b', 'c'] };
    expect(needsRepeaterIds(data)).toBe(false);
  });

  it('detects missing _id in nested objects', () => {
    const data = { items: [{ _id: 'x', nested: [{ value: 1 }] }] };
    expect(needsRepeaterIds(data)).toBe(true);
  });
});

describe('injectRepeaterIds()', () => {
  it('adds _id to array-of-objects items', () => {
    const result = injectRepeaterIds({ items: [{ name: 'A' }] });
    expect(result.items[0]._id).toBeDefined();
    expect(result.items[0]._id).toHaveLength(8); // 4 bytes = 8 hex chars
    expect(result.items[0].name).toBe('A');
  });

  it('preserves existing _id values', () => {
    const result = injectRepeaterIds({ items: [{ _id: 'existing', name: 'A' }] });
    expect(result.items[0]._id).toBe('existing');
  });

  it('leaves primitive arrays untouched', () => {
    const result = injectRepeaterIds({ tags: ['x', 'y'] });
    expect(result.tags).toEqual(['x', 'y']);
  });

  it('injects _id into nested array items', () => {
    const result = injectRepeaterIds({ items: [{ _id: 'a', nested: [{ val: 1 }] }] });
    expect(result.items[0].nested[0]._id).toBeDefined();
    expect(result.items[0].nested[0].val).toBe(1);
  });

  it('handles empty arrays', () => {
    const result = injectRepeaterIds({ items: [] });
    expect(result.items).toEqual([]);
  });

  it('generates unique ids per item', () => {
    const result = injectRepeaterIds({ items: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    const ids = result.items.map((i: any) => i._id);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });
});
