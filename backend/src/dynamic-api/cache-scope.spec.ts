import { changedNothing, entryIdsToLookUp, idsIn, isCachedWrite, scopeFromArgs, scopeFromResult } from './cache-scope';

describe('cache-scope', () => {
  it('recognises Entry and ContentType writes only', () => {
    expect(isCachedWrite({ model: 'Entry', action: 'updateMany' })).toBe(true);
    expect(isCachedWrite({ model: 'Entry', action: 'findMany' })).toBe(false);
    expect(isCachedWrite({ model: 'User', action: 'update' })).toBe(false);
  });

  it('reads ids from number, equals and in filters', () => {
    expect(idsIn(3)).toEqual([3]);
    expect(idsIn({ equals: 4 })).toEqual([4]);
    expect(idsIn({ in: [1, 2] })).toEqual([1, 2]);
    expect(idsIn({ gt: 1 })).toBeNull();
    expect(idsIn('3')).toBeNull();
  });

  describe('scopeFromArgs', () => {
    it('entry create: contentTypeId or relation connect', () => {
      expect(scopeFromArgs({ model: 'Entry', action: 'create', args: { data: { contentTypeId: 2 } } })).toEqual([2]);
      expect(scopeFromArgs({ model: 'Entry', action: 'create', args: { data: { contentType: { connect: { id: 6 } } } } })).toEqual([6]);
    });

    it('entry createMany: union of types, unknown if any row lacks one', () => {
      expect(scopeFromArgs({ model: 'Entry', action: 'createMany', args: { data: [{ contentTypeId: 1 }, { contentTypeId: 1 }, { contentTypeId: 3 }] } })).toEqual([1, 3]);
      expect(scopeFromArgs({ model: 'Entry', action: 'createMany', args: { data: [{ contentTypeId: 1 }, { slug: 'x' }] } })).toBeNull();
    });

    it('entry update: contentTypeId in where or the compound unique key', () => {
      expect(scopeFromArgs({ model: 'Entry', action: 'updateMany', args: { where: { contentTypeId: 5 }, data: {} } })).toEqual([5]);
      expect(scopeFromArgs({ model: 'Entry', action: 'update', args: { where: { contentTypeId_slug_locale: { contentTypeId: 8, slug: 'a', locale: 'en' } }, data: {} } })).toEqual([8]);
      expect(scopeFromArgs({ model: 'Entry', action: 'update', args: { where: { id: 1 }, data: {} } })).toBeNull();
    });

    it('moving an entry to another content type invalidates everything', () => {
      expect(scopeFromArgs({ model: 'Entry', action: 'update', args: { where: { contentTypeId: 1 }, data: { contentTypeId: 2 } } })).toBe('all');
      expect(scopeFromArgs({ model: 'Entry', action: 'upsert', args: { where: {}, create: { contentTypeId: 1 }, update: { contentTypeId: 2 } } })).toBe('all');
    });

    it('content type writes use where.id; creates wait for the result', () => {
      expect(scopeFromArgs({ model: 'ContentType', action: 'update', args: { where: { id: 4 }, data: {} } })).toEqual([4]);
      expect(scopeFromArgs({ model: 'ContentType', action: 'create', args: { data: { name: 'x' } } })).toBeNull();
    });
  });

  it('scopeFromResult reads single-row results only', () => {
    expect(scopeFromResult({ model: 'Entry', action: 'update' }, { contentTypeId: 3 })).toEqual([3]);
    expect(scopeFromResult({ model: 'ContentType', action: 'create' }, { id: 9 })).toEqual([9]);
    expect(scopeFromResult({ model: 'Entry', action: 'update' }, { id: 1 })).toBeNull(); // narrow select
    expect(scopeFromResult({ model: 'Entry', action: 'updateMany' }, { count: 2 })).toBeNull();
  });

  it('entryIdsToLookUp only for entry writes filtered by id', () => {
    expect(entryIdsToLookUp({ model: 'Entry', action: 'updateMany', args: { where: { id: { in: [1, 2] } } } })).toEqual([1, 2]);
    expect(entryIdsToLookUp({ model: 'ContentType', action: 'update', args: { where: { id: 1 } } })).toBeNull();
  });

  it('changedNothing is true only for a zero count', () => {
    expect(changedNothing({ count: 0 })).toBe(true);
    expect(changedNothing({ count: 1 })).toBe(false);
    expect(changedNothing({ id: 1 })).toBe(false);
  });
});
