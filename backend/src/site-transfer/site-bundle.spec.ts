import { planEntries, planWebhooks, remapIds, ExistingEntry, rewriteBaseUrl } from './site-bundle';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('remapIds', () => {
  it('replaces matching strings at any depth and leaves keys and other values alone', () => {
    const ids = new Map([[A, B]]);
    expect(remapIds({ author: A, [A]: 'x', tags: [A, 'a'], blocks: [{ link: { to: A } }], n: 1, t: null }, ids))
      .toEqual({ author: B, [A]: 'x', tags: [B, 'a'], blocks: [{ link: { to: B } }], n: 1, t: null });
  });
});

describe('planEntries', () => {
  const known = new Set(['post', 'author']);
  const existing: ExistingEntry[] = [
    { id: 1, publicId: C, type: 'author', slug: 'asha', locale: 'en', deleted: false },
    { id: 2, publicId: A, type: 'post', slug: 'old', locale: 'en', deleted: true },
  ];

  it('creates, updates and relinks relations to matched entries', () => {
    const plan = planEntries({
      author: [{ publicId: B, slug: 'asha', locale: 'en', status: 'published', data: { name: 'Asha' } }],
      post: [{ publicId: '44444444-4444-4444-8444-444444444444', slug: 'hello', locale: 'en', status: 'draft', data: { author: B } }],
    }, known, existing, true);
    expect(plan.errors).toEqual([]);
    expect(plan.types.find((t) => t.name === 'author')).toMatchObject({ toUpdate: 1, toCreate: 0 });
    expect(plan.types.find((t) => t.name === 'post')).toMatchObject({ toCreate: 1 });
    // The author already exists here as C: the post's relation follows it.
    expect(plan.remapped.get(B)).toBe(C);
    expect(plan.writes.get('post')![0]).toMatchObject({ publicId: '44444444-4444-4444-8444-444444444444', data: { author: C } });
    expect(plan.writes.get('author')![0]).toMatchObject({ existingId: 1, publicId: C });
  });

  it('restores a match in the trash and gives a new id when the bundle id is taken', () => {
    const plan = planEntries({
      post: [
        { publicId: B, slug: 'old', locale: 'en', status: 'published', data: {} },
        { publicId: A, slug: 'new', locale: 'en', status: 'published', data: { self: A } },
      ],
    }, known, existing, true);
    expect(plan.types[0]).toMatchObject({ toRestore: 1, toCreate: 1 });
    const created = plan.writes.get('post')![1];
    expect(created.publicId).not.toBe(A);
    expect(created.data).toEqual({ self: created.publicId });
  });

  it('keeps existing entries when overwrite is off, but still relinks to them', () => {
    const plan = planEntries({
      author: [{ publicId: B, slug: 'asha', status: 'published' }],
      post: [{ slug: 'p', status: 'draft', data: { author: B } }],
    }, known, existing, false);
    expect(plan.types[0]).toMatchObject({ toSkip: 1 });
    expect(plan.writes.get('author')).toEqual([]);
    expect(plan.writes.get('post')![0].data).toEqual({ author: C });
  });

  it('reports problems without writing', () => {
    const plan = planEntries({
      nope: [],
      post: [
        { slug: 'Bad Slug', status: 'draft' },
        { slug: 'x', status: 'live' },
        { slug: 'y', locale: 'en', status: 'draft' },
        { slug: 'y', locale: 'EN', status: 'draft' },
        { slug: 'z', publicId: 'not-a-uuid' },
        { slug: 'w', data: [] },
        { publicId: B, slug: 'v1' },
        { publicId: B, slug: 'v2' },
      ],
    }, known, existing, true);
    expect(plan.errors).toEqual([
      expect.stringContaining('no content type named "nope"'),
      expect.stringContaining('Invalid slug'),
      expect.stringContaining('status must be'),
      expect.stringContaining('appears twice in the file'),
      expect.stringContaining('publicId must be a UUID'),
      expect.stringContaining('data must be an object'),
      expect.stringContaining(`publicId ${B} appears twice`),
    ]);
  });

  it('collects the locales used and canonicalises them', () => {
    const plan = planEntries({ post: [{ slug: 'a', locale: 'pt-br', status: 'draft' }] }, known, [], true);
    expect([...plan.locales]).toEqual(['pt-BR']);
    expect(plan.writes.get('post')![0].locale).toBe('pt-BR');
  });
});

describe('planWebhooks', () => {
  const hook = (over: Record<string, unknown> = {}) => ({ name: 'Rebuild', url: 'https://example.test/hook', secret: 'shh', events: ['*'], enabled: true, ...over });
  const existing = [{ id: 7, name: 'Rebuild', url: 'https://example.test/hook' }];

  it('treats a file without webhooks as nothing to do', () => {
    expect(planWebhooks(undefined, existing, true)).toMatchObject({ total: 0, writes: [], active: [], errors: [] });
  });

  it('matches by name and URL, so another address is a new webhook', () => {
    const plan = planWebhooks([hook(), hook({ url: 'https://other.test/hook' })], existing, true);
    expect(plan).toMatchObject({ total: 2, toCreate: 1, toUpdate: 1, errors: [] });
    expect(plan.writes.map((w) => w.id)).toEqual([7, undefined]);
  });

  it('keeps existing webhooks with overwrite off', () => {
    const plan = planWebhooks([hook()], existing, false);
    expect(plan).toMatchObject({ toSkip: 1, toUpdate: 0, writes: [], active: [] });
  });

  it('lists only the addresses that will receive events', () => {
    const plan = planWebhooks([hook(), hook({ name: 'Off', url: 'https://off.test/', enabled: false })], [], true);
    expect(plan.active).toEqual(['https://example.test/hook']);
  });

  it('accepts a localhost URL, as a site may have one', () => {
    expect(planWebhooks([hook({ url: 'http://localhost:3000/api/revalidate' })], [], true).errors).toEqual([]);
  });

  it.each([
    ['a row that is not an object', 'x', /must be an object/],
    ['a missing name', hook({ name: '' }), /missing name/],
    ['a URL that is not http(s)', hook({ url: 'ftp://example.test' }), /http\(s\) URL/],
    ['no events', hook({ events: [] }), /events must be a list/],
    ['a secret that is not text', hook({ secret: 1 }), /secret must be text/],
    ['a flag that is not a boolean', hook({ enabled: 'yes' }), /enabled must be true or false/],
  ])('refuses %s', (_label, row, message) => {
    const plan = planWebhooks([row], [], true);
    expect(plan.errors[0]).toMatch(message);
    expect(plan.writes).toEqual([]);
  });

  it('refuses the same name and URL twice in the file', () => {
    expect(planWebhooks([hook(), hook()], [], true).errors[0]).toMatch(/appears twice/);
  });
});

describe('rewriteBaseUrl', () => {
  const from = 'http://old.test';
  const to = 'https://new.test/';
  it('moves uploads links at any depth, rich text included', () => {
    expect(rewriteBaseUrl({ a: 'http://old.test/uploads/x.png', b: [{ c: '<img src="http://old.test/uploads/y.png">' }], n: 1 }, from, to))
      .toEqual({ a: 'https://new.test/uploads/x.png', b: [{ c: '<img src="https://new.test/uploads/y.png">' }], n: 1 });
  });
  it('leaves other addresses and object keys alone', () => {
    const value = { 'http://old.test/uploads/k': 'http://old.test/page', cdn: 'https://cdn.test/uploads/x.png' };
    expect(rewriteBaseUrl(value, from, to)).toEqual(value);
  });
  it('does nothing without two different addresses', () => {
    expect(rewriteBaseUrl('http://old.test/uploads/x', from, undefined)).toBe('http://old.test/uploads/x');
    expect(rewriteBaseUrl('http://old.test/uploads/x', from, 'http://old.test/')).toBe('http://old.test/uploads/x');
  });
});
