import { AdminPresence, cleanDetail, cleanPath } from './admin-presence';

describe('AdminPresence', () => {
  const asha = { id: 1, name: 'Asha', email: 'asha@example.test', role: 'admin' };
  const ravi = { id: 2, name: null, email: 'ravi.k@example.test', role: 'editor' };

  it('lists each person once, on the page of the tab they used last, without their email', () => {
    let t = 0;
    const p = new AdminPresence(() => ++t);
    p.update('a1', asha, { path: '/media' });
    p.update('r1', ravi, { path: '/entries?ct=pages' });
    p.update('a2', asha, { path: '/entries/7/edit', detail: { type: 'Pages', slug: 'contact', locale: 'en' } });
    expect(p.list()).toEqual([
      { id: 1, name: 'Asha', role: 'admin', path: '/entries/7/edit', detail: { type: 'Pages', slug: 'contact', locale: 'en' } },
      { id: 2, name: 'ravi.k', role: 'editor', path: '/entries?ct=pages', detail: null },
    ]);
    expect(JSON.stringify(p.list())).not.toContain('@');
  });

  it('drops a tab when it closes, and the person when their last tab closes', () => {
    const p = new AdminPresence();
    p.update('a1', asha, { path: '/' });
    p.update('a2', asha, { path: '/media' });
    expect(p.remove('a2')).toBe(true);
    expect(p.list().map((u) => u.path)).toEqual(['/']);
    p.remove('a1');
    expect(p.list()).toEqual([]);
    expect(p.remove('never-listed')).toBe(false);
  });

  it('ignores API-key connections', () => {
    const p = new AdminPresence();
    expect(p.update('k', { id: 0, email: 'apikey:site', role: 'viewer' }, { path: '/' })).toBe(false);
    expect(p.list()).toEqual([]);
  });

  it('keeps paths inside the admin and trims what a tab sends', () => {
    expect(cleanPath('/entries?ct=pages')).toBe('/entries?ct=pages');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil.test', 42, undefined]) expect(cleanPath(bad)).toBe('/');
    expect(cleanPath('/' + 'x'.repeat(500))).toHaveLength(300);
    expect(cleanDetail({ type: 'Pages', slug: 'about' })).toEqual({ type: 'Pages', slug: 'about' });
    expect(cleanDetail({ type: 'Pages' })).toBeNull();
    expect(cleanDetail('nope')).toBeNull();
  });
});
