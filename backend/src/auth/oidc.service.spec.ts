import { mapRole, safeReturnTo } from './oidc.service';

describe('OIDC helpers', () => {
  it('safeReturnTo only allows same-site paths', () => {
    expect(safeReturnTo('/entries?x=1')).toBe('/entries?x=1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
  });

  it('mapRole picks the highest mapped role from a list or single claim', () => {
    const map = 'cms-viewers:viewer, cms-editors:editor ,cms-admins:admin';
    expect(mapRole({ groups: ['cms-editors', 'cms-admins'] }, 'groups', map)).toBe('admin');
    expect(mapRole({ groups: ['cms-editors'] }, 'groups', map)).toBe('editor');
    expect(mapRole({ role: 'cms-viewers' }, 'role', map)).toBe('viewer');
    expect(mapRole({ groups: ['staff'] }, 'groups', map)).toBeNull();
  });

  it('mapRole ignores unknown roles and an unset mapping', () => {
    expect(mapRole({ groups: ['x'] }, 'groups', 'x:superuser')).toBeNull();
    expect(mapRole({ groups: ['x'] }, undefined, 'x:admin')).toBeNull();
    expect(mapRole({ groups: ['x'] }, 'groups', undefined)).toBeNull();
  });

  it('mapRole accepts custom role names, ranked as their base role', () => {
    const custom = { reviewer: 'contributor', lead: 'editor' };
    const map = 'cms-reviewers:reviewer,cms-leads:lead,cms-viewers:viewer,cms-admins:admin';
    expect(mapRole({ groups: ['cms-reviewers'] }, 'groups', map, custom)).toBe('reviewer');
    expect(mapRole({ groups: ['cms-viewers', 'cms-reviewers'] }, 'groups', map, custom)).toBe('reviewer');
    expect(mapRole({ groups: ['cms-reviewers', 'cms-leads'] }, 'groups', map, custom)).toBe('lead');
    expect(mapRole({ groups: ['cms-leads', 'cms-admins'] }, 'groups', map, custom)).toBe('admin');
    // Without the role list, a custom name is unknown
    expect(mapRole({ groups: ['cms-reviewers'] }, 'groups', map)).toBeNull();
  });
});
