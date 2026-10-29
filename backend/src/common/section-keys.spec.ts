import { autoSectionKeys, sectionKeyErrors, withSectionKeys } from './section-keys';
import { FieldDef } from '../fields/field.types';

const schema = [
  { name: 'title', type: 'text' },
  { name: 'sections', type: 'flexible', options: { layouts: [{ name: 'magic', fields: [{ name: 'title_right', type: 'text' }] }, { name: 'hero', fields: [] }] } },
] as unknown as FieldDef[];

describe('section keys', () => {
  it('a layout used once needs no key; unique snake_case keys are fine', () => {
    expect(sectionKeyErrors([{ _layout: 'hero' }, { _layout: 'magic', _key: 'intro_magic' }, { _layout: 'magic', _key: 'footer_2' }], 'sections')).toEqual([]);
  });

  it('every section of a layout used more than once needs a key', () => {
    const errors = sectionKeyErrors([{ _layout: 'magic', _key: 'a' }, { _layout: 'magic' }, { _layout: 'magic', _key: '' }, { _layout: 'hero' }], 'sections');
    expect(errors).toEqual([
      expect.stringMatching(/^sections\[1\]\._key: required — the layout "magic" is used more than once/),
      expect.stringMatching(/^sections\[2\]\._key: required/),
    ]);
  });

  it('refuses invalid and repeated keys', () => {
    const errors = sectionKeyErrors([{ _key: 'Intro' }, { _key: '2nd' }, { _key: 'a' }, { _key: 'a' }, { _key: 5 }], 'sections');
    expect(errors).toHaveLength(4);
    expect(errors[0]).toMatch(/^sections\[0\]\._key: must start/);
    expect(errors[2]).toMatch(/sections\[3\]\._key "a": another section/);
  });

  it('<field>_by_key: keys, plus layouts used once under their name, in order; the list is untouched', () => {
    const sections = [{ _layout: 'hero' }, { _layout: 'magic', _key: 'intro', title_right: 'A' }, { _layout: 'magic', _key: 'footer', title_right: 'C' }];
    const out = withSectionKeys({ title: 'x', sections }, schema);
    expect(out.sections).toBe(sections);
    expect(out.sections_by_key).toEqual({ hero: sections[0], intro: sections[1], footer: sections[2] });
    expect(Object.keys(out.sections_by_key)).toEqual(['hero', 'intro', 'footer']);
  });

  it('an explicit key wins over a layout name; unkeyed repeats are left out', () => {
    const sections = [{ _layout: 'hero' }, { _layout: 'magic', _key: 'hero' }, { _layout: 'magic' }];
    expect(withSectionKeys({ sections }, schema).sections_by_key).toEqual({ hero: sections[1] });
  });

  it('adds nothing for an empty field, and never shadows a real field', () => {
    const data = { sections: [] };
    expect(withSectionKeys(data, schema)).toBe(data);
    const clash = [...schema, { name: 'sections_by_key', type: 'json' }] as unknown as FieldDef[];
    const keyed = { sections: [{ _layout: 'magic', _key: 'a' }], sections_by_key: { mine: true } };
    expect(withSectionKeys(keyed, clash).sections_by_key).toEqual({ mine: true });
  });

  it('autoSectionKeys names repeats (layout, layout_2…) and keeps existing keys', () => {
    const out = autoSectionKeys([
      { _layout: 'hero' }, { _layout: 'magic' }, { _layout: 'magic', _key: 'magic_2' }, { _layout: 'magic' },
    ] as Record<string, unknown>[]);
    expect(out.map((s) => s._key)).toEqual([undefined, 'magic', 'magic_2', 'magic_3']);
    expect(sectionKeyErrors(out, 'sections')).toEqual([]);
  });
});
