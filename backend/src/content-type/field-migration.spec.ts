import { conversionSql, impactQuery, planMigrations, removedNestedFields, retypedFields, stepQuery } from './field-migration';

const oldSchema = [
  { name: 'headline', type: 'text' },
  { name: 'price', type: 'text' },
  { name: 'tags', type: 'select', options: { choices: ['a', 'b'], multiple: true } },
  { name: 'legacy', type: 'text' },
];
const newSchema = [
  { name: 'title', type: 'text' },
  { name: 'price', type: 'number' },
  { name: 'tags', type: 'select', options: { choices: ['a', 'b'] } },
];

describe('planMigrations', () => {
  it('orders renames, conversions, then drops', () => {
    const steps = planMigrations(oldSchema, newSchema, {
      drop: ['legacy'],
      convert: ['price', 'tags'],
      renames: [{ from: 'headline', to: 'title' }],
    });
    expect(steps.map((s) => `${s.kind}:${s.field}`)).toEqual(['rename:title', 'convert:price', 'convert:tags', 'drop:legacy']);
    expect(steps[2]).toMatchObject({ fromType: 'select[]', toType: 'select' });
  });

  it('converts a renamed field from its old type', () => {
    const steps = planMigrations([{ name: 'cost', type: 'text' }], [{ name: 'price', type: 'number' }], {
      renames: [{ from: 'cost', to: 'price' }],
      convert: ['price'],
    });
    expect(steps[1]).toMatchObject({ kind: 'convert', field: 'price', fromType: 'text', toType: 'number' });
  });

  it('skips conversions where the type did not change', () => {
    expect(planMigrations(newSchema, newSchema, { convert: ['title'] })).toEqual([]);
  });

  it.each([
    [{ renames: [{ from: 'missing', to: 'title' }] }, /"missing" is not a field/],
    [{ renames: [{ from: 'price', to: 'title' }] }, /"price" is still in the new schema/],
    [{ renames: [{ from: 'headline', to: 'nope' }] }, /"nope" is not in the new schema/],
    [{ drop: ['price'] }, /"price" is still in the new schema/],
    [{ drop: ['headline'], renames: [{ from: 'headline', to: 'title' }] }, /"headline" is being renamed/],
    [{ convert: ['legacy'] }, /must be in both/],
  ])('rejects %j', (migrations, message) => {
    try {
      planMigrations(oldSchema, newSchema, migrations as any);
      throw new Error('expected an error');
    } catch (err: any) {
      expect(err.response.errors.join(' ')).toMatch(message);
    }
  });

  it('rejects impossible conversions', () => {
    expect(() => planMigrations([{ name: 'x', type: 'text' }], [{ name: 'x', type: 'image' }], { convert: ['x'] }))
      .toThrow('Invalid field migrations');
  });
});

describe('conversionSql', () => {
  it.each([
    ['text', 'number'], ['text', 'boolean'], ['number', 'text'], ['richtext', 'text'], ['text', 'richtext'],
    ['select', 'select[]'], ['select[]', 'select'], ['boolean', 'text'], ['image', 'json'],
  ])('converts %s → %s', (from, to) => expect(conversionSql(from, to)).toBeTruthy());

  it.each([['text', 'image'], ['repeater', 'text'], ['relation', 'number'], ['text', 'text']])(
    'has no conversion for %s → %s', (from, to) => expect(conversionSql(from, to)).toBeNull(),
  );
});

describe('retypedFields', () => {
  it('lists fields whose type changed, following renames', () => {
    const out = retypedFields([{ name: 'cost', type: 'text' }, { name: 'n', type: 'text' }], [{ name: 'price', type: 'number' }, { name: 'n', type: 'text' }], [{ from: 'cost', to: 'price' }]);
    expect(out).toEqual([{ field: 'price', fromType: 'text', toType: 'number', convertible: true }]);
  });
});

describe('nested fields', () => {
  const before = [
    { name: 'seo', type: 'group', options: { subFields: [{ name: 'headline', type: 'text' }, { name: 'old', type: 'text' }] } },
    { name: 'links', type: 'repeater', options: { subFields: [{ name: 'href', type: 'text' }, { name: 'weight', type: 'text' }] } },
    { name: 'blocks', type: 'flexible', options: { layouts: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }] }] } },
  ];
  const after = [
    { name: 'meta', type: 'group', options: { subFields: [{ name: 'title', type: 'text' }] } },
    { name: 'links', type: 'repeater', options: { subFields: [{ name: 'url', type: 'text' }, { name: 'weight', type: 'number' }] } },
    { name: 'blocks', type: 'flexible', options: { layouts: [{ name: 'hero', fields: [{ name: 'title', type: 'text' }] }] } },
  ];

  it('plans renames inside groups (also when the group is renamed), repeaters and layouts', () => {
    const steps = planMigrations(before, after, {
      renames: [{ from: 'meta.headline', to: 'meta.title' }, { from: 'seo', to: 'meta' }, { from: 'links.href', to: 'links.url' }, { from: 'blocks.hero.heading', to: 'blocks.hero.title' }],
      convert: ['links.weight'],
      drop: ['meta.old'],
    });
    expect(steps.map((s) => `${s.kind}:${s.field}:${s.container ?? 'top'}`)).toEqual([
      'rename:meta:top', 'rename:meta.title:group', 'rename:links.url:repeater', 'rename:blocks.hero.title:flexible',
      'convert:links.weight:repeater', 'drop:meta.old:group',
    ]);
  });

  it('keeps nested renames in their container', () => {
    expect(() => planMigrations(before, after, { renames: [{ from: 'links.href', to: 'meta.title' }] }))
      .toThrow('Invalid field migrations');
  });

  it('lists nested retyped and removed fields', () => {
    const renames = [{ from: 'seo', to: 'meta' }, { from: 'meta.headline', to: 'meta.title' }];
    expect(retypedFields(before, after, renames)).toEqual([{ field: 'links.weight', fromType: 'text', toType: 'number', convertible: true }]);
    expect(removedNestedFields(before, after, renames)).toEqual(['meta.old', 'links.href', 'blocks.hero.heading']);
  });
});

describe('stepQuery', () => {
  it('passes field names as parameters, never in the SQL', () => {
    const top = stepQuery(7, { kind: 'rename', field: 'title', from: 'headline' });
    expect(top.sql).not.toMatch(/title|headline/);
    expect(top.params).toEqual([7, 'title', 'headline']);

    const nested = stepQuery(7, { kind: 'convert', field: 'blocks.hero.weight', fromType: 'text', toType: 'number', container: 'flexible' });
    expect(nested.sql).not.toMatch(/blocks|hero|weight/);
    expect(nested.params).toEqual([7, 'blocks', 'hero', 'weight']);
    expect(nested.sql.match(/\$\d+/g)!.every((n) => Number(n.slice(1)) <= nested.params.length)).toBe(true);

    const impact = impactQuery(7, { kind: 'drop', field: 'links.href', container: 'repeater' });
    expect(impact.params).toEqual([7, 'links', 'href']);
  });
});

describe('deeply nested fields', () => {
  // blocks (flexible) → hero layout → buttons (repeater) → link (group) → url
  const layout = (buttons: any[]) => [{
    name: 'blocks', type: 'flexible',
    options: { layouts: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }, { name: 'buttons', type: 'repeater', options: { subFields: buttons } }] }] },
  }];
  const before = layout([{ name: 'label', type: 'text' }, { name: 'weight', type: 'text' }, { name: 'link', type: 'group', options: { subFields: [{ name: 'href', type: 'text' }, { name: 'old', type: 'text' }] } }]);
  const after = layout([{ name: 'text', type: 'text' }, { name: 'weight', type: 'number' }, { name: 'link', type: 'group', options: { subFields: [{ name: 'url', type: 'text' }] } }]);

  it('plans renames, conversions and drops at any depth', () => {
    const steps = planMigrations(before, after, {
      renames: [{ from: 'blocks.hero.buttons.label', to: 'blocks.hero.buttons.text' }, { from: 'blocks.hero.buttons.link.href', to: 'blocks.hero.buttons.link.url' }],
      convert: ['blocks.hero.buttons.weight'],
      drop: ['blocks.hero.buttons.link.old'],
    });
    expect(steps.map((s) => `${s.kind}:${s.field}:${s.hops!.map((h) => h.type).join('>')}`)).toEqual([
      'rename:blocks.hero.buttons.text:flexible>repeater',
      'rename:blocks.hero.buttons.link.url:flexible>repeater>group',
      'convert:blocks.hero.buttons.weight:flexible>repeater',
      'drop:blocks.hero.buttons.link.old:flexible>repeater>group',
    ]);
  });

  it('finds removed and retyped fields deep down, following a renamed container', () => {
    const renamedContainer = layout([]).map((f) => ({
      ...f, options: { layouts: [{ name: 'hero', fields: [{ name: 'heading', type: 'text' }, { name: 'ctas', type: 'repeater', options: { subFields: [{ name: 'label', type: 'text' }, { name: 'weight', type: 'number' }] } }] }] },
    }));
    const renames = [{ from: 'blocks.hero.buttons', to: 'blocks.hero.ctas' }];
    expect(removedNestedFields(before, renamedContainer, renames)).toEqual(['blocks.hero.ctas.link']);
    expect(retypedFields(before, renamedContainer, renames)).toEqual([expect.objectContaining({ field: 'blocks.hero.ctas.weight', fromType: 'text', toType: 'number' })]);
    expect(() => planMigrations(before, renamedContainer, { renames, convert: ['blocks.hero.ctas.weight'] })).not.toThrow();
  });

  it('builds one parameterised statement through every container', () => {
    const [step] = planMigrations(before, after, { drop: ['blocks.hero.buttons.link.old'] });
    const q = stepQuery(3, step);
    expect(q.sql).not.toMatch(/blocks|hero|buttons|link|old/);
    expect(q.params).toEqual([3, 'blocks', 'hero', 'buttons', 'link', 'old']);
    expect(q.sql).toContain("AS t1(el, ord)");
    expect(q.sql).toContain("AS t2(el, ord)");
    const impact = impactQuery(3, step);
    expect(impact.sql).not.toMatch(/blocks|hero|buttons|link|old/);
  });
});
