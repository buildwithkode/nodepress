import { parsePopulatePaths, populateDeep, populateManyDeep } from './populate.util';
import { FieldDef } from '../fields/field.types';

describe('populate.util', () => {
  describe('parsePopulatePaths', () => {
    it('parses single-level paths', () => {
      const tree = parsePopulatePaths(['author', 'tags']);
      expect(tree.get('author')).toEqual([]);
      expect(tree.get('tags')).toEqual([]);
    });

    it('parses nested dot-notation paths', () => {
      const tree = parsePopulatePaths(['author', 'author.company', 'author.company.address']);
      expect(tree.get('author')).toEqual(['company', 'company.address']);
    });
  });

  describe('populateManyDeep (Batch List Resolution)', () => {
    const authorSchema: FieldDef[] = [
      { name: 'name', type: 'text' },
      { name: 'company', type: 'relation', options: { relatedContentType: 'company', cardinality: 'one' } },
    ];

    const companySchema: FieldDef[] = [
      { name: 'name', type: 'text' },
      { name: 'city', type: 'text' },
    ];

    const postSchema: FieldDef[] = [
      { name: 'title', type: 'text' },
      { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
      { name: 'tags', type: 'relation', options: { relatedContentType: 'tag', cardinality: 'many' } },
    ];

    it('resolves top-level relations across multiple entries in a single database query', async () => {
      const mockPrisma = {
        entry: {
          findMany: jest.fn().mockResolvedValue([
            { publicId: 'author-1', data: { name: 'Alice' }, contentType: { name: 'author', schema: authorSchema } },
            { publicId: 'author-2', data: { name: 'Bob' }, contentType: { name: 'author', schema: authorSchema } },
          ]),
        },
      };

      const entries = [
        { title: 'Post 1', author: 'author-1' },
        { title: 'Post 2', author: 'author-2' },
        { title: 'Post 3', author: 'author-1' }, // Reuses author-1
      ];

      const result = await populateManyDeep(entries, postSchema, ['author'], mockPrisma as any);

      // Only 1 DB query made for all 3 entries
      expect(mockPrisma.entry.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.entry.findMany).toHaveBeenCalledWith({
        where: { publicId: { in: ['author-1', 'author-2'] }, deletedAt: null },
        include: { contentType: true },
      });

      expect(result[0].author).toEqual(expect.objectContaining({ publicId: 'author-1', data: { name: 'Alice' } }));
      expect(result[1].author).toEqual(expect.objectContaining({ publicId: 'author-2', data: { name: 'Bob' } }));
      expect(result[2].author).toEqual(expect.objectContaining({ publicId: 'author-1', data: { name: 'Alice' } }));
    });

    it('resolves cardinality:many relations correctly as arrays', async () => {
      const mockPrisma = {
        entry: {
          findMany: jest.fn().mockResolvedValue([
            { publicId: 'tag-1', data: { name: 'Tech' }, contentType: { name: 'tag', schema: [] } },
            { publicId: 'tag-2', data: { name: 'News' }, contentType: { name: 'tag', schema: [] } },
          ]),
        },
      };

      const entries = [
        { title: 'Post 1', tags: ['tag-1', 'tag-2'] },
      ];

      const result = await populateManyDeep(entries, postSchema, ['tags'], mockPrisma as any);

      expect(Array.isArray(result[0].tags)).toBe(true);
      expect(result[0].tags).toHaveLength(2);
      expect(result[0].tags[0].publicId).toBe('tag-1');
      expect(result[0].tags[1].publicId).toBe('tag-2');
    });

    it('resolves nested relations with batched queries per level', async () => {
      const mockPrisma = {
        entry: {
          findMany: jest.fn()
            .mockResolvedValueOnce([
              // Level 1: Authors
              { publicId: 'author-1', data: { name: 'Alice', company: 'comp-1' }, contentType: { name: 'author', schema: authorSchema } },
            ])
            .mockResolvedValueOnce([
              // Level 2: Companies (batched)
              { publicId: 'comp-1', data: { name: 'Acme Corp', city: 'SF' }, contentType: { name: 'company', schema: companySchema } },
            ]),
        },
      };

      const entries = [
        { title: 'Post 1', author: 'author-1' },
      ];

      const result = await populateManyDeep(entries, postSchema, ['author', 'author.company'], mockPrisma as any);

      expect(mockPrisma.entry.findMany).toHaveBeenCalledTimes(2);
      expect(result[0].author.data.company.data.name).toBe('Acme Corp');
    });

    it('returns empty array unchanged', async () => {
      const mockPrisma = { entry: { findMany: jest.fn() } };
      const result = await populateManyDeep([], postSchema, ['author'], mockPrisma as any);
      expect(result).toEqual([]);
      expect(mockPrisma.entry.findMany).not.toHaveBeenCalled();
    });
  });

  describe('populateDeep (Single Entry Resolution)', () => {
    const authorSchema: FieldDef[] = [{ name: 'name', type: 'text' }];
    const postSchema: FieldDef[] = [
      { name: 'title', type: 'text' },
      { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
    ];

    it('populates single entry relation', async () => {
      const mockPrisma = {
        entry: {
          findMany: jest.fn().mockResolvedValue([
            { publicId: 'author-1', data: { name: 'Alice' }, contentType: { name: 'author', schema: authorSchema } },
          ]),
        },
      };

      const result = await populateDeep({ title: 'My Post', author: 'author-1' }, postSchema, ['author'], mockPrisma as any);
      expect(result.author.publicId).toBe('author-1');
      expect(result.author.data.name).toBe('Alice');
    });
  });
});
