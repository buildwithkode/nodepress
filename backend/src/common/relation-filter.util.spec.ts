import { extractRelationFilters, RELATION_FILTER_LIMIT } from './relation-filter.util';
import { FieldDef } from '../fields/field.types';

const schema: FieldDef[] = [
  { name: 'title', type: 'text' },
  { name: 'author', type: 'relation', options: { relatedContentType: 'person', cardinality: 'one' } },
  { name: 'tags', type: 'relation', options: { relatedContentType: 'tag', cardinality: 'many' } },
];

function db(ids: string[]) {
  return {
    contentType: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
    entry: { findMany: jest.fn().mockResolvedValue(ids.map((publicId) => ({ publicId }))) },
  } as any;
}

describe('extractRelationFilters', () => {
  it('leaves plain filters and UUID comparisons alone', async () => {
    const where = { title: { eq: 'x' }, author: { eq: 'a-uuid' } };
    const prisma = db([]);
    expect(await extractRelationFilters(where, schema, prisma)).toEqual({ where, conditions: [] });
    expect(prisma.entry.findMany).not.toHaveBeenCalled();
  });

  it('turns a nested filter into "points at one of the matches"', async () => {
    const prisma = db(['p1', 'p2']);
    const res = await extractRelationFilters({ author: { slug: { eq: 'jane' } }, title: 'x' }, schema, prisma, { publishedOnly: true });
    expect(res.where).toEqual({ title: 'x' });
    expect(res.conditions).toEqual([
      { OR: [{ data: { path: ['author'], equals: 'p1' } }, { data: { path: ['author'], equals: 'p2' } }] },
    ]);
    expect(prisma.entry.findMany.mock.calls[0][0].where).toMatchObject({ contentTypeId: 7, deletedAt: null, status: 'published' });
  });

  it('accepts dot notation, and many-relations use array_contains', async () => {
    const res = await extractRelationFilters({ 'tags.name': { in: 'news,tech' } }, schema, db(['t1']));
    expect(res.conditions).toEqual([{ OR: [{ data: { path: ['tags'], array_contains: ['t1'] } }] }]);
  });

  it('matches nothing when no related entry matches, and refuses too many', async () => {
    expect((await extractRelationFilters({ author: { slug: 'nobody' } }, schema, db([]))).conditions).toEqual([{ id: { in: [] } }]);
    const many = Array.from({ length: RELATION_FILTER_LIMIT + 1 }, (_, i) => `id${i}`);
    await expect(extractRelationFilters({ author: { slug: { contains: 'a' } } }, schema, db(many))).rejects.toThrow(/more than/);
  });
});
