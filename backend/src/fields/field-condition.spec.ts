import { conditionErrors, conditionMet, hiddenFields } from './field-condition';
import { DataValidator } from './data.validator';
import { SchemaValidator } from './schema.validator';

describe('conditionMet', () => {
  it.each([
    [{ field: 'k', op: 'eq', value: 'video' }, 'video', true],
    [{ field: 'k', op: 'eq', value: 'video' }, 'image', false],
    [{ field: 'k', op: 'eq', value: 'video' }, ['image', 'video'], true],
    [{ field: 'k', op: 'ne', value: true }, false, true],
    [{ field: 'k', op: 'in', value: ['a', 'b'] }, 'b', true],
    [{ field: 'k', op: 'notIn', value: ['a', 'b'] }, 'c', true],
    [{ field: 'k', op: 'set' }, '', false],
    [{ field: 'k', op: 'set' }, [], false],
    [{ field: 'k', op: 'notSet' }, undefined, true],
  ])('%j with %j → %s', (cond, value, expected) => expect(conditionMet(cond as any, value)).toBe(expected));
});

describe('hiddenFields', () => {
  const fields = [
    { name: 'kind' },
    { name: 'video_url', condition: { field: 'kind', op: 'eq' as const, value: 'video' } },
    { name: 'autoplay', condition: { field: 'video_url', op: 'set' as const } },
  ];

  it('hides a field whose condition field is hidden', () => {
    expect([...hiddenFields(fields, { kind: 'image', video_url: 'https://x' })]).toEqual(['video_url', 'autoplay']);
    expect([...hiddenFields(fields, { kind: 'video', video_url: 'https://x' })]).toEqual([]);
  });
});

describe('conditionErrors', () => {
  const at = (i: number) => `schema[${i}]`;
  it('accepts a valid condition', () => {
    expect(conditionErrors([{ name: 'a' }, { name: 'b', condition: { field: 'a', op: 'in', value: [1, 2] } }], at)).toEqual([]);
  });

  it.each([
    [{ field: 'zzz', op: 'set' }, /must name a field next to this one/],
    [{ field: 'b', op: 'set' }, /can't depend on itself/],
    [{ field: 'a', op: 'like' }, /op: must be one of/],
    [{ field: 'a', op: 'eq', value: { x: 1 } }, /must be a string, number or boolean/],
    [{ field: 'a', op: 'in', value: [] }, /non-empty list/],
  ])('rejects %j', (condition, message) => {
    expect(conditionErrors([{ name: 'a' }, { name: 'b', condition }], at).join(' ')).toMatch(message);
  });

  it('rejects cycles once', () => {
    const errors = conditionErrors([
      { name: 'a', condition: { field: 'b', op: 'set' } },
      { name: 'b', condition: { field: 'a', op: 'set' } },
    ], at);
    expect(errors).toEqual(['schema[0].condition: circular — a → b → a']);
  });
});

describe('conditions in the validators', () => {
  const schema = new SchemaValidator().validate([
    { name: 'kind', type: 'select', options: { choices: ['image', 'video'] } },
    { name: 'video_url', type: 'text', required: true, condition: { field: 'kind', op: 'eq', value: 'video' } },
    {
      name: 'links', type: 'repeater',
      options: { subFields: [{ name: 'external', type: 'boolean' }, { name: 'url', type: 'text', required: true, condition: { field: 'external', op: 'eq', value: true } }] },
    },
  ]);
  const data = new DataValidator();

  it('does not require a hidden field', () => {
    expect(() => data.validate({ kind: 'image', links: [{ external: false }] }, schema)).not.toThrow();
  });

  it('requires it once it is shown, also inside repeater rows', () => {
    expect(() => data.validate({ kind: 'video' }, schema)).toThrow();
    try {
      data.validate({ kind: 'image', links: [{ external: true }] }, schema);
    } catch (err: any) {
      expect(err.response.errors).toEqual(['links[0].url: required']);
    }
  });

  it('checks conditions inside sub-fields', () => {
    expect(() => new SchemaValidator().validate([
      { name: 'g', type: 'group', options: { subFields: [{ name: 'x', type: 'text', condition: { field: 'nope', op: 'set' } }] } },
    ])).toThrow('Invalid schema');
  });
});
