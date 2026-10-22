import { conversionSql, planMigrations, retypedFields, stepParams, stepSql } from './field-migration';

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

describe('stepSql', () => {
  it('passes field names as parameters, never in the SQL', () => {
    const rename = { kind: 'rename' as const, field: 'title', from: 'headline' };
    expect(stepSql(rename)).not.toMatch(/title|headline/);
    expect(stepParams(7, rename)).toEqual([7, 'title', 'headline']);
    expect(stepParams(7, { kind: 'drop', field: 'legacy' })).toEqual([7, 'legacy']);
  });
});
