import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { validateSubmission, FormLimits } from './submission-validator';
import { FormField } from './types/form-field.types';

const LIMITS: FormLimits = {
  maxDepth: 3,
  maxArrayItems: 100,
  maxFields: 200,
  maxPayloadBytes: 102400,
};

/** Run and capture the thrown 400 error body. */
function expectErrors(fields: FormField[], raw: Record<string, unknown>, limits = LIMITS) {
  try {
    validateSubmission(fields, raw, limits);
  } catch (e) {
    if (e instanceof BadRequestException) {
      return (e.getResponse() as { errors: { path: string; rule: string }[] }).errors;
    }
    throw e;
  }
  throw new Error('Expected validation to throw');
}

describe('validateSubmission', () => {
  // ── Full spec payload ──────────────────────────────────────────────────────
  describe('full nested payload (spec §2)', () => {
    const fields: FormField[] = [
      { name: 'name', type: 'text' },
      { name: 'age', type: 'number', validation: { integer: true, min: 0, max: 120 } },
      { name: 'salary', type: 'number' },
      { name: 'isActive', type: 'boolean' },
      { name: 'country', type: 'text' },
      { name: 'email', type: 'email' },
      { name: 'skills', type: 'tags' },
      { name: 'address', type: 'group', fields: [
        { name: 'city', type: 'text' },
        { name: 'pincode', type: 'number' },
      ] },
      { name: 'avatar', type: 'url' },
      { name: 'documents', type: 'repeater', fields: [
        { name: 'name', type: 'text' },
        { name: 'url', type: 'url' },
      ] },
      { name: 'joiningDate', type: 'date' },
      { name: 'lastLogin', type: 'datetime' },
      { name: 'manager', type: 'text' },
    ];

    const payload = {
      name: 'Karthik',
      age: 29,
      salary: 50000.5,
      isActive: true,
      country: 'India',
      email: 'Leo9Karthik@gmail.com',
      skills: ['React', 'NextJS'],
      address: { city: 'Mumbai', pincode: 400001 },
      avatar: 'https://example.com/avatar.jpg',
      documents: [{ name: 'Resume', url: 'https://example.com/resume.pdf' }],
      joiningDate: '2026-06-24',
      lastLogin: '2026-06-24T12:30:00Z',
      manager: null,
    };

    it('accepts and type-preserves the whole payload', () => {
      const out = validateSubmission(fields, payload, LIMITS);
      expect(out.name).toBe('Karthik');
      expect(out.age).toBe(29);
      expect(out.salary).toBe(50000.5);
      expect(out.isActive).toBe(true);
      expect(out.email).toBe('leo9karthik@gmail.com'); // lowercased
      expect(out.skills).toEqual(['React', 'NextJS']);  // array preserved
      expect(out.address).toEqual({ city: 'Mumbai', pincode: 400001 }); // object preserved
      expect(out.documents).toEqual([{ name: 'Resume', url: 'https://example.com/resume.pdf' }]);
      expect(out.joiningDate).toBe('2026-06-24');       // normalized
      expect(out.lastLogin).toBe('2026-06-24T12:30:00.000Z'); // ISO normalized
      expect(out.manager).toBeNull();
    });
  });

  // ── Required ───────────────────────────────────────────────────────────────
  describe('required', () => {
    it('flags a missing required field (new validation shape)', () => {
      const errs = expectErrors([{ name: 'email', type: 'email', validation: { required: true } }], {});
      expect(errs).toEqual([{ path: 'email', rule: 'required', message: '"email" is required' }]);
    });

    it('honors the legacy top-level required flag', () => {
      const errs = expectErrors([{ name: 'name', type: 'text', required: true }], { name: '' });
      expect(errs[0]).toMatchObject({ path: 'name', rule: 'required' });
    });

    it('treats an empty array as empty for required', () => {
      const errs = expectErrors([{ name: 'skills', type: 'tags', validation: { required: true } }], { skills: [] });
      expect(errs[0]).toMatchObject({ path: 'skills', rule: 'required' });
    });
  });

  // ── Scalars ────────────────────────────────────────────────────────────────
  describe('scalar coercion & rules', () => {
    it('rejects non-numeric numbers and enforces integer/min/max', () => {
      const f: FormField[] = [{ name: 'age', type: 'number', validation: { integer: true, min: 18, max: 60 } }];
      expect(expectErrors(f, { age: 'abc' })[0]).toMatchObject({ rule: 'number' });
      expect(expectErrors(f, { age: 12.5 }).map((e) => e.rule)).toEqual(expect.arrayContaining(['integer', 'min']));
      expect(expectErrors(f, { age: 99 })[0]).toMatchObject({ rule: 'max' });
    });

    it('validates email / url / phone', () => {
      expect(expectErrors([{ name: 'e', type: 'email' }], { e: 'nope' })[0]).toMatchObject({ rule: 'email' });
      expect(expectErrors([{ name: 'u', type: 'url' }], { u: 'not a url' })[0]).toMatchObject({ rule: 'url' });
      expect(expectErrors([{ name: 'p', type: 'phone' }], { p: 'abc' })[0]).toMatchObject({ rule: 'pattern' });
    });

    it('enforces string length and pattern', () => {
      const f: FormField[] = [{ name: 's', type: 'text', validation: { minLength: 3, maxLength: 5, pattern: '^[a-z]+$' } }];
      expect(expectErrors(f, { s: 'ab' })[0]).toMatchObject({ rule: 'minLength' });
      expect(expectErrors(f, { s: 'abcdef' }).map((e) => e.rule)).toEqual(expect.arrayContaining(['maxLength']));
      expect(expectErrors(f, { s: 'AB1' }).map((e) => e.rule)).toEqual(expect.arrayContaining(['pattern']));
    });

    it('coerces booleans (incl. legacy checkbox alias)', () => {
      const out = validateSubmission(
        [{ name: 'a', type: 'boolean' }, { name: 'b', type: 'checkbox' }],
        { a: 'true', b: 0 },
        LIMITS,
      );
      expect(out.a).toBe(true);
      expect(out.b).toBe(false);
    });

    it('normalizes dates and rejects invalid ones', () => {
      const out = validateSubmission([{ name: 'd', type: 'date' }], { d: '2026-06-24T09:00:00Z' }, LIMITS);
      expect(out.d).toBe('2026-06-24');
      expect(expectErrors([{ name: 'd', type: 'date' }], { d: 'June 24' })[0]).toMatchObject({ rule: 'date' });
    });

    it('enforces select / multiselect options', () => {
      const sel: FormField[] = [{ name: 's', type: 'select', options: ['a', 'b'] }];
      expect(expectErrors(sel, { s: 'c' })[0]).toMatchObject({ rule: 'options' });
      const ms: FormField[] = [{ name: 'm', type: 'multiselect', options: ['a', 'b'] }];
      expect(expectErrors(ms, { m: ['a', 'x'] })[0]).toMatchObject({ path: 'm[1]', rule: 'options' });
    });
  });

  // ── Nested paths ─────────────────────────────────────────────────────────────
  describe('nested error paths', () => {
    it('reports dot paths for groups and [i] for repeaters', () => {
      const fields: FormField[] = [
        { name: 'address', type: 'group', fields: [{ name: 'pincode', type: 'number', validation: { required: true } }] },
        { name: 'docs', type: 'repeater', fields: [{ name: 'url', type: 'url', validation: { required: true } }] },
      ];
      const errs = expectErrors(fields, { address: {}, docs: [{ url: '' }, { url: 'bad' }] });
      const paths = errs.map((e) => e.path);
      expect(paths).toContain('address.pincode');
      expect(paths).toContain('docs[0].url');
      expect(paths).toContain('docs[1].url');
    });

    it('enforces array item counts (minItems/maxItems)', () => {
      const f: FormField[] = [{ name: 't', type: 'tags', validation: { minItems: 2, maxItems: 3 } }];
      expect(expectErrors(f, { t: ['a'] })[0]).toMatchObject({ rule: 'minItems' });
      expect(expectErrors(f, { t: ['a', 'b', 'c', 'd'] })[0]).toMatchObject({ rule: 'maxItems' });
    });
  });

  // ── Guardrails ───────────────────────────────────────────────────────────────
  describe('guardrails', () => {
    it('rejects payloads over the size limit (413)', () => {
      const big = { s: 'x'.repeat(50) };
      expect(() => validateSubmission([{ name: 's', type: 'text' }], big, { ...LIMITS, maxPayloadBytes: 10 }))
        .toThrow(PayloadTooLargeException);
    });

    it('rejects arrays over maxArrayItems', () => {
      const errs = expectErrors([{ name: 't', type: 'tags' }], { t: ['a', 'b', 'c'] }, { ...LIMITS, maxArrayItems: 2 });
      expect(errs[0]).toMatchObject({ rule: 'maxArrayItems' });
    });

    it('rejects nesting deeper than maxDepth', () => {
      const fields: FormField[] = [
        { name: 'a', type: 'group', fields: [
          { name: 'b', type: 'group', fields: [
            { name: 'c', type: 'text' },
          ] },
        ] },
      ];
      const errs = expectErrors(fields, { a: { b: { c: 'x' } } }, { ...LIMITS, maxDepth: 2 });
      expect(errs.some((e) => e.rule === 'maxDepth')).toBe(true);
    });

    it('rejects too many fields', () => {
      const fields: FormField[] = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, type: 'text' as const }));
      const raw = Object.fromEntries(fields.map((f) => [f.name, 'x']));
      const errs = expectErrors(fields, raw, { ...LIMITS, maxFields: 3 });
      expect(errs.some((e) => e.rule === 'maxFields')).toBe(true);
    });
  });

  // ── Back-compat ──────────────────────────────────────────────────────────────
  describe('backward compatibility', () => {
    it('handles a legacy flat form unchanged', () => {
      const fields: FormField[] = [
        { name: 'full_name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'message', type: 'textarea', required: true },
      ];
      const out = validateSubmission(fields, { full_name: 'Jane', email: 'a@b.com', message: 'hi' }, LIMITS);
      expect(out).toEqual({ full_name: 'Jane', email: 'a@b.com', message: 'hi' });
    });

    it('drops unknown keys not in the schema', () => {
      const out = validateSubmission([{ name: 'name', type: 'text' }], { name: 'Jane', evil: 'x' }, LIMITS);
      expect(out).toEqual({ name: 'Jane' });
    });
  });
});
