import { UnprocessableEntityException } from '@nestjs/common';
import { DataValidator } from './data.validator';

const validator = new DataValidator();

// ── Helpers ───────────────────────────────────────────────────────────────────

function expectValid(data: any, schema: any, options?: any) {
  expect(() => validator.validate(data, schema, options)).not.toThrow();
}

function expectErrors(data: any, schema: any, ...messages: string[]) {
  try {
    validator.validate(data, schema);
    fail('Expected validation to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const body = (err as UnprocessableEntityException).getResponse() as any;
    for (const msg of messages) {
      expect(body.errors.join('\n')).toContain(msg);
    }
  }
}

// ── Text fields ───────────────────────────────────────────────────────────────

describe('text validation', () => {
  const schema = [{ name: 'title', type: 'text', required: true }];

  it('passes with a valid string', () => {
    expectValid({ title: 'Hello world' }, schema);
  });

  it('fails when required field is absent', () => {
    expectErrors({}, schema, 'title: required');
  });

  it('fails when value is not a string', () => {
    expectErrors({ title: 42 }, schema, 'title: must be a string');
  });

  it('respects minLength', () => {
    const s = [{ name: 'bio', type: 'text', required: false, options: { minLength: 10 } }];
    expectErrors({ bio: 'short' }, s, 'at least 10');
    expectValid({ bio: '0123456789' }, s);
  });

  it('respects maxLength', () => {
    const s = [{ name: 'summary', type: 'text', required: false, options: { maxLength: 5 } }];
    expectErrors({ summary: 'too long string' }, s, 'at most 5');
  });

  it('respects pattern', () => {
    const s = [{ name: 'code', type: 'text', required: false, options: { pattern: '^[A-Z]{3}$' } }];
    expectErrors({ code: 'abc' }, s, 'does not match required pattern');
    expectValid({ code: 'ABC' }, s);
  });
});

// ── Number fields ─────────────────────────────────────────────────────────────

describe('number validation', () => {
  const schema = [{ name: 'age', type: 'number', required: false }];

  it('passes with a valid number', () => {
    expectValid({ age: 25 }, schema);
  });

  it('fails when value is not a number', () => {
    expectErrors({ age: 'twenty' }, schema, 'must be a finite number');
  });

  it('fails for Infinity', () => {
    expectErrors({ age: Infinity }, schema, 'must be a finite number');
  });

  it('respects integer constraint', () => {
    const s = [{ name: 'qty', type: 'number', required: false, options: { integer: true } }];
    expectErrors({ qty: 3.5 }, s, 'must be an integer');
    expectValid({ qty: 3 }, s);
  });

  it('respects min/max', () => {
    const s = [{ name: 'score', type: 'number', required: false, options: { min: 0, max: 100 } }];
    expectErrors({ score: -1 }, s, '≥ 0');
    expectErrors({ score: 101 }, s, '≤ 100');
    expectValid({ score: 50 }, s);
  });
});

// ── Boolean fields ────────────────────────────────────────────────────────────

describe('boolean validation', () => {
  const schema = [{ name: 'active', type: 'boolean', required: false }];

  it('passes with true/false', () => {
    expectValid({ active: true }, schema);
    expectValid({ active: false }, schema);
  });

  it('fails when value is not a boolean', () => {
    expectErrors({ active: 'yes' }, schema, 'must be a boolean');
    expectErrors({ active: 1 }, schema, 'must be a boolean');
  });
});

// ── Select fields ─────────────────────────────────────────────────────────────

describe('select validation', () => {
  const schema = [{
    name: 'color',
    type: 'select',
    required: false,
    options: { choices: ['red', 'green', 'blue'], multiple: false },
  }];

  it('passes with a valid choice', () => {
    expectValid({ color: 'red' }, schema);
  });

  it('fails with an invalid choice', () => {
    expectErrors({ color: 'purple' }, schema, '"purple" is not a valid choice');
  });

  it('fails when not a string', () => {
    expectErrors({ color: 42 }, schema, 'must be a string');
  });

  it('supports multiple select', () => {
    const s = [{
      name: 'tags',
      type: 'select',
      required: false,
      options: { choices: ['a', 'b', 'c'], multiple: true },
    }];
    expectValid({ tags: ['a', 'b'] }, s);
    expectErrors({ tags: ['a', 'x'] }, s, '"x" is not a valid choice');
    expectErrors({ tags: 'a' }, s, 'must be an array');
  });
});

// ── Partial update ────────────────────────────────────────────────────────────

describe('partial option', () => {
  const schema = [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'text', required: true },
  ];

  it('does not require absent fields in partial mode', () => {
    expectValid({ title: 'New title' }, schema, { partial: true });
  });

  it('still validates present fields in partial mode', () => {
    expectErrors({ title: 123 }, schema, 'must be a string');
  });
});

// ── Repeater fields ───────────────────────────────────────────────────────────

describe('repeater validation', () => {
  const schema = [{
    name: 'faq',
    type: 'repeater',
    required: false,
    options: {
      subFields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'text', required: true },
      ],
      minItems: 1,
      maxItems: 5,
    },
  }];

  it('passes with valid items', () => {
    expectValid({ faq: [{ question: 'Q?', answer: 'A.' }] }, schema as any);
  });

  it('fails when not an array', () => {
    expectErrors({ faq: 'not an array' }, schema as any, 'must be an array');
  });

  it('respects minItems', () => {
    expectErrors({ faq: [] }, schema as any, 'at least 1');
  });

  it('respects maxItems', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    expectErrors({ faq: items }, schema as any, 'at most 5');
  });

  it('validates sub-field types', () => {
    expectErrors({ faq: [{ question: 123, answer: 'A' }] }, schema as any, 'must be a string');
  });

  it('reports missing required sub-fields with full path', () => {
    expectErrors({ faq: [{ question: 'Q?' }] }, schema as any, 'faq[0].answer: required');
  });
});
