import { planForms } from './form-import';

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
