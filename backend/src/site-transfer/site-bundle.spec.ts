import { planEntries, planForms, remapIds, ExistingEntry } from './site-bundle';

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

describe('planForms', () => {
  const form = (over: Record<string, unknown> = {}) => ({ name: 'Contact', slug: 'contact', fields: [{ name: 'email', type: 'email' }], actions: [], ...over });

  it('treats a file without forms as nothing to do', () => {
    expect(planForms(undefined, new Set(['contact']), true)).toMatchObject({ total: 0, toCreate: 0, toUpdate: 0, toSkip: 0, errors: [] });
  });

  it('matches by slug: new forms are created, existing ones updated', () => {
    const plan = planForms([form(), form({ slug: 'newsletter' })], new Set(['contact']), true);
    expect(plan).toMatchObject({ total: 2, toCreate: 1, toUpdate: 1, toSkip: 0, errors: [] });
    expect(plan.creates.map((f) => f.slug)).toEqual(['newsletter']);
    expect(plan.updates.map((f) => f.slug)).toEqual(['contact']);
  });

  it('keeps existing forms with overwrite off and still adds missing ones', () => {
    const plan = planForms([form(), form({ slug: 'newsletter' })], new Set(['contact']), false);
    expect(plan).toMatchObject({ toCreate: 1, toUpdate: 0, toSkip: 1 });
    expect(plan.updates).toEqual([]);
  });

  it('applies the same defaults and slug rules as the forms API', () => {
    const { actions, ...noActions } = form({ slug: 'Contact Us' });
    const plan = planForms([noActions], new Set(), true);
    expect(plan.creates[0]).toEqual(expect.objectContaining({ slug: 'contact-us', actions: [], isActive: true, captchaEnabled: false }));
    expect(planForms([form({ isActive: false })], new Set(), true).creates[0].isActive).toBe(false);
  });

  it('refuses forms that are not a list', () => {
    expect(planForms('nope', new Set(), true).errors[0]).toMatch(/must be a list/);
  });

  it.each([
    ['a row that is not an object', 'x', /must be an object/],
    ['a missing slug', form({ slug: undefined }), /missing slug/],
    ['a reserved slug', form({ slug: 'api' }), /reserved slug/],
    ['a missing name', form({ name: ' ' }), /missing name/],
    ['fields that are not a list', form({ fields: {} }), /fields must be a list/],
    ['actions that are not a list', form({ actions: 'email' }), /actions must be a list/],
    ['a flag that is not a boolean', form({ captchaEnabled: 'yes' }), /captchaEnabled must be true or false/],
  ])('refuses %s', (_label, row, message) => {
    const plan = planForms([row], new Set(), true);
    expect(plan.errors[0]).toMatch(message);
    expect(plan.creates).toEqual([]);
  });

  it('refuses a slug twice in the file, also after normalizing', () => {
    expect(planForms([form(), form({ slug: 'CONTACT' })], new Set(), true).errors[0]).toMatch(/appears twice/);
  });
});
