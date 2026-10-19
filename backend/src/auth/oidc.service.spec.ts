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
});
