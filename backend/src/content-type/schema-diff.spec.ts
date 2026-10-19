import { diffSchemas } from './schema-diff';

describe('diffSchemas', () => {
  it('reports added, removed, type changes, newly required and modified fields', () => {
    const before = [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'textarea' },
      { name: 'old', type: 'text' },
      { name: 'cat', type: 'select', options: { choices: ['a'] } },
    ];
    const after = [
      { name: 'title', type: 'text', required: true },
      { name: 'body', type: 'richtext' },
      { name: 'cat', type: 'select', options: { choices: ['a', 'b'] } },
      { name: 'tags', type: 'text' },
    ];
    expect(diffSchemas(before, after)).toEqual({
      added: ['tags'],
      removed: ['old'],
      typeChanged: [{ name: 'body', from: 'textarea', to: 'richtext' }],
      nowRequired: ['title'],
      modified: ['cat'],
      unchanged: false,
    });
  });

  it('treats key order as irrelevant', () => {
    const a = [{ name: 'f', type: 'select', options: { x: 1, y: 2 } }];
    const b = [{ type: 'select', name: 'f', options: { y: 2, x: 1 } }];
    expect(diffSchemas(a, b).unchanged).toBe(true);
  });

  it('handles missing schemas', () => {
    expect(diffSchemas(undefined, [{ name: 'a', type: 'text' }]).added).toEqual(['a']);
  });
});
