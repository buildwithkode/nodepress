import { buildOpenApiDocument, publicReadFields, publicWriteFields } from './openapi.builder';
import { lintOpenApi } from './openapi-lint';
import { OpenApiService } from './openapi.service';

const blog = {
  name: 'blog_post',
  displayName: 'Blog post',
  allowedMethods: null,
  schema: [
    { name: 'title', type: 'text', required: true, options: { maxLength: 120 } },
    { name: 'body', type: 'richtext' },
    { name: 'views', type: 'number', options: { integer: true, min: 0 } },
    { name: 'featured', type: 'boolean' },
    { name: 'category', type: 'select', options: { choices: ['news', 'howto'] } },
    { name: 'tags', type: 'select', options: { choices: ['a', 'b'], multiple: true } },
    { name: 'cover', type: 'image' },
    { name: 'accent', type: 'color' },
    { name: 'published_on', type: 'date' },
    { name: 'starts_at', type: 'datetime' },
    { name: 'meta', type: 'json' },
    { name: 'author', type: 'relation', options: { relatedContentType: 'author', cardinality: 'one' } },
    { name: 'related', type: 'relation', options: { relatedContentType: 'blog_post', cardinality: 'many' } },
    {
      name: 'faq',
      type: 'repeater',
      options: { subFields: [{ name: 'question', type: 'text', required: true }, { name: 'answer', type: 'textarea' }], maxItems: 10 },
    },
    { name: 'address', type: 'group', options: { subFields: [{ name: 'city', type: 'text' }] } },
    {
      name: 'blocks',
      type: 'flexible',
      options: {
        layouts: [
          { name: 'hero', label: 'Hero', fields: [{ name: 'heading', type: 'text', required: true }] },
          { name: 'quote', fields: [{ name: 'text', type: 'textarea' }] },
        ],
      },
    },
    { name: 'internal_notes', type: 'text', readRoles: ['admin', 'editor'] },
    { name: 'locked', type: 'text', writeRoles: ['admin'] },
  ],
};
const author = {
  name: 'author',
  displayName: 'Author',
  allowedMethods: ['list', 'read'],
  schema: [
    { name: 'name', type: 'text', required: true },
    { name: 'posts', type: 'relation', options: { relatedContentType: 'blog_post', cardinality: 'many', mappedBy: 'author' } },
  ],
};

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument([blog, author], { serverUrl: 'https://cms.example.com/', version: '9.9.9' });
  const S = doc.components.schemas;

  it('is structurally valid OpenAPI 3.1', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('9.9.9');
    expect(doc.servers).toEqual([{ url: 'https://cms.example.com/api' }]);
    expect(lintOpenApi(doc)).toEqual([]);
  });

  it('creates list/get/create/update/delete paths, respecting allowedMethods', () => {
    expect(Object.keys(doc.paths['/blog_post'])).toEqual(['get', 'post']);
    expect(Object.keys(doc.paths['/blog_post/{slug}'])).toEqual(['get', 'put', 'delete']);
    expect(Object.keys(doc.paths['/author'])).toEqual(['get']);
    expect(Object.keys(doc.paths['/author/{slug}'])).toEqual(['get']);
    expect(S.AuthorInput).toBeUndefined();
    expect(doc.paths['/blog_post'].get.operationId).toBe('listBlogPosts');
    expect(doc.paths['/blog_post/{slug}'].put.operationId).toBe('updateBlogPost');
    expect(doc.paths['/author'].get.tags).toEqual(['Author']);
  });

  it('documents every list query parameter and the write security', () => {
    const names = doc.paths['/blog_post'].get.parameters.map((p: any) => p.name);
    for (const n of ['page', 'limit', 'cursor', 'sort', 'fields', 'populate', 'search', 'locale', 'fallback', 'stage', 'where']) {
      expect(names).toContain(n);
    }
    expect(doc.paths['/blog_post'].post.security).toEqual([{ ApiKey: [] }, { bearerAuth: [] }]);
    expect(doc.components.securitySchemes.ApiKey).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-API-Key' });
    expect(doc.paths['/blog_post'].post.requestBody.content['application/json'].schema.properties.data).toEqual({
      $ref: '#/components/schemas/BlogPostInput',
    });
  });

  it('maps every field type', () => {
    const p = S.BlogPostData.properties;
    const inner = (s: any) => s.oneOf?.[0] ?? s; // read fields are nullable
    expect(inner(p.title)).toMatchObject({ type: 'string', maxLength: 120 });
    expect(inner(p.body)).toMatchObject({ type: 'string', contentMediaType: 'text/html' });
    expect(inner(p.views)).toMatchObject({ type: 'integer', minimum: 0 });
    expect(inner(p.featured)).toMatchObject({ type: 'boolean' });
    expect(inner(p.category)).toMatchObject({ type: 'string', enum: ['news', 'howto'] });
    expect(inner(p.tags)).toMatchObject({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } });
    expect(inner(p.cover)).toEqual({ $ref: '#/components/schemas/NodePressImage' });
    expect(inner(p.accent).pattern).toBeDefined();
    expect(inner(p.published_on)).toMatchObject({ type: 'string', format: 'date' });
    expect(inner(p.starts_at)).toMatchObject({ type: 'string', format: 'date-time' });
    expect(inner(p.meta)).toMatchObject({ type: ['object', 'array'] });
    // Top-level relation: uuid, or the populated entry
    expect(inner(p.author).oneOf).toEqual([{ type: 'string', format: 'uuid' }, { $ref: '#/components/schemas/NodePressPopulatedEntry' }]);
    expect(inner(p.related)).toMatchObject({ type: 'array' });
    expect(inner(p.faq)).toMatchObject({ type: 'array', maxItems: 10, items: { type: 'object' } });
    expect(Object.keys(inner(p.faq).items.properties)).toEqual(['_id', 'question', 'answer']);
    expect(inner(p.address)).toMatchObject({ type: 'object', properties: { city: expect.any(Object) } });
    const blocks = inner(p.blocks).items;
    expect(blocks.discriminator).toEqual({
      propertyName: '_layout',
      mapping: { hero: '#/components/schemas/BlogPostBlocksHero', quote: '#/components/schemas/BlogPostBlocksQuote' },
    });
    expect(S.BlogPostBlocksHero.properties._layout).toEqual({ type: 'string', const: 'hero' });
    expect(S.BlogPostBlocksHero.title).toBe('Hero');
  });

  it('inputs: required on create only, relations are ids, write-protected and reverse fields left out', () => {
    expect(S.BlogPostInput.required).toEqual(['title']);
    expect(S.BlogPostInput.properties.title).toMatchObject({ type: 'string' });
    expect(S.BlogPostInput.properties.author.oneOf[0]).toMatchObject({ type: 'string', format: 'uuid' });
    expect(S.BlogPostInput.properties.locked).toBeUndefined();
    expect(S.BlogPostUpdateInput.required).toBeUndefined();
    expect(S.BlogPostBlocksHeroInput.required).toEqual(['_layout', 'heading']);
    expect(S.BlogPostBlocksHeroUpdateInput.required).toEqual(['_layout']);
    expect(S.BlogPostInput.properties.faq.oneOf[0].items.required).toEqual(['question']);
  });

  it('read schemas leave out fields hidden from public reads; reverse fields are read-only', () => {
    expect(S.BlogPostData.properties.internal_notes).toBeUndefined();
    expect(S.BlogPostData.properties.locked).toBeDefined();
    expect(S.AuthorData.properties.posts).toMatchObject({ type: 'array', readOnly: true });
  });

  it('keeps component and operation names unique', () => {
    const clash = buildOpenApiDocument([
      { name: 'node_press_image', schema: [] },
      { name: 'a_b', schema: [] },
      { name: 'a__b', schema: [] },
    ]);
    expect(clash.components.schemas.NodePressImage.oneOf).toBeDefined(); // the shared one survives
    expect(clash.components.schemas.NodePressImage2).toBeDefined();
    expect(clash.components.schemas.AB).toBeDefined();
    expect(clash.components.schemas.AB2).toBeDefined();
    expect(lintOpenApi(clash)).toEqual([]);
  });

  it('skips types with no allowed methods', () => {
    const d = buildOpenApiDocument([{ name: 'secret', schema: [], allowedMethods: [] }]);
    expect(d.paths).toEqual({});
    expect(d.components.schemas.Secret).toBeUndefined();
  });
});

describe('publicReadFields / publicWriteFields', () => {
  it('follow the field-level security rules', () => {
    const schema: any[] = [
      { name: 'a', type: 'text' },
      { name: 'b', type: 'text', options: { readRoles: ['admin'] } },
      { name: 'c', type: 'text', options: { writeRoles: ['editor'] } },
      { name: 'd', type: 'relation', options: { relatedContentType: 'x', cardinality: 'many', mappedBy: 'y' } },
    ];
    expect(publicReadFields(schema).map((f) => f.name)).toEqual(['a', 'c', 'd']);
    expect(publicWriteFields(schema).map((f) => f.name)).toEqual(['a', 'b']);
  });
});

describe('lintOpenApi', () => {
  it('reports broken refs, missing responses and path params', () => {
    const problems = lintOpenApi({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x/{id}': { get: { operationId: 'a', responses: {} } },
        '/y': { get: { operationId: 'a', responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Nope' } } } } } } },
      },
      components: { schemas: { Obj: { type: 'object', properties: {}, required: ['missing'] } } },
    });
    expect(problems).toEqual(expect.arrayContaining([
      'openapi must be 3.1.x',
      'GET /x/{id}: no responses',
      'GET /x/{id}: {id} has no path parameter',
      'GET /y: duplicate operationId a',
      expect.stringContaining('unresolved $ref #/components/schemas/Nope'),
      expect.stringContaining('required "missing" is not a property'),
    ]));
  });
});

describe('OpenApiService', () => {
  const make = () => {
    let hook: any;
    const state = { count: 1, updatedAt: new Date('2026-01-01') };
    const prisma: any = {
      onOperation: (fn: any) => (hook = fn),
      contentType: {
        aggregate: jest.fn(async () => ({ _count: { _all: state.count }, _max: { updatedAt: state.updatedAt } })),
        findMany: jest.fn(async () => [{ name: 'note', schema: [{ name: 'title', type: 'text' }], allowedMethods: null }]),
      },
    };
    const service = new OpenApiService(prisma);
    service.onModuleInit();
    return { service, prisma, state, hook: () => hook };
  };

  it('caches the document until the fingerprint changes', async () => {
    const { service, prisma, state } = make();
    const a = await service.document();
    expect(a.paths['/note']).toBeDefined();
    await service.document();
    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(1);
    state.updatedAt = new Date('2026-01-02');
    await service.document();
    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(2);
  });

  it('drops the cache on a content type write in this process', async () => {
    const { service, prisma, hook } = make();
    await service.document();
    await hook()({ model: 'ContentType', action: 'update' }, async () => ({}));
    await service.document();
    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(2);
    await hook()({ model: 'Entry', action: 'update' }, async () => ({}));
    await service.document();
    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(2);
  });
});
