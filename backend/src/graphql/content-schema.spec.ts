import { buildSchema, printSchema } from 'graphql';
import { buildContentSchema, pascal, plural } from './content-schema';

const base = buildSchema(`
  scalar JSON
  type EntryModel { id: Int! }
  type Query { entries: [EntryModel!]! entry(id: Int!): EntryModel }
`);
const resolvers = { list: jest.fn(), single: jest.fn(), relation: jest.fn() };

describe('buildContentSchema', () => {
  it('names types and queries after the content type', () => {
    expect(pascal('blog_post')).toBe('BlogPost');
    expect(pascal('2024_report')).toBe('T2024Report');
    expect(plural('category')).toBe('categories');
    expect(plural('box')).toBe('boxes');
    expect(plural('day')).toBe('days');

    const { schema, queries } = buildContentSchema(base, [
      { name: 'category', schema: [{ name: 'title', type: 'text' }] },
      { name: 'news', schema: [] },
    ], resolvers);
    expect(queries).toEqual({ category: { single: 'category', list: 'categories' }, news: { single: 'news', list: 'newses' } });
    const sdl = printSchema(schema);
    expect(sdl).toContain('categories(');
    expect(sdl).toMatch(/type CategoryData {\s+title: String\s+}/);
    // An empty schema has no Data type — data is plain JSON.
    expect(sdl).toMatch(/type News {[^}]*data: JSON/);
    // The code-first queries are kept.
    expect(sdl).toContain('entries: [EntryModel!]!');
  });

  it('skips content types whose names collide, and honours allowedMethods', () => {
    const { skipped, queries } = buildContentSchema(base, [
      { name: 'entry', schema: [] },
      { name: 'entry_model', schema: [] },
      { name: 'page', schema: [], allowedMethods: ['read'] },
    ], resolvers);
    expect(skipped.map((s) => s.name)).toEqual(['entry', 'entry_model']);
    expect(queries.page).toEqual({ single: 'page' });
  });

  it('relations to a type that is not in the schema fall back to ids', () => {
    const { schema } = buildContentSchema(base, [
      { name: 'post', schema: [{ name: 'author', type: 'relation', options: { relatedContentType: 'missing', cardinality: 'many' } }] },
    ], resolvers);
    expect(printSchema(schema)).toMatch(/author: \[ID!\]/);
  });
});
