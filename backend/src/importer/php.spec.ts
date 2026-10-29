import { isSerializedPhp, unserializePhp } from './php';

describe('unserializePhp', () => {
  it('reads scalars, lists and maps', () => {
    expect(unserializePhp('s:5:"hello";')).toBe('hello');
    expect(unserializePhp('i:-42;')).toBe(-42);
    expect(unserializePhp('d:1.5;')).toBe(1.5);
    expect(unserializePhp('b:1;')).toBe(true);
    expect(unserializePhp('N;')).toBeNull();
    expect(unserializePhp('a:2:{i:0;s:7:"jasmine";i:1;s:5:"lemon";}')).toEqual(['jasmine', 'lemon']);
    expect(unserializePhp('a:2:{s:5:"title";s:4:"Shop";s:3:"url";s:1:"/";}')).toEqual({ title: 'Shop', url: '/' });
    expect(unserializePhp('a:1:{i:1;s:1:"x";}')).toEqual({ 1: 'x' }); // not 0…n-1: a map
  });

  it('counts string lengths in UTF-8 bytes', () => {
    expect(unserializePhp('s:6:"café!";')).toBe('café!');
    expect(unserializePhp('a:1:{s:4:"name";s:6:"日本";}')).toEqual({ name: '日本' });
  });

  it('reads strings whose length a search-and-replace broke', () => {
    // "old.test" was replaced with "new-site.test" without fixing the length.
    expect(unserializePhp('a:2:{s:3:"url";s:16:"https://new-site.test/a";s:5:"title";s:1:"A";}'))
      .toEqual({ url: 'https://new-site.test/a', title: 'A' });
  });

  it('turns objects into plain property maps', () => {
    expect(unserializePhp('O:3:"Foo":2:{s:1:"a";i:1;s:6:"\0Foo\0b";i:2;}')).toEqual({ a: 1, b: 2 });
  });

  it('returns undefined for anything else', () => {
    for (const v of ['hello', '', '42', 'a:1:{', 'a:1:{i:0;s:1:"x";}junk', 'x:1;']) expect(unserializePhp(v)).toBeUndefined();
    expect(isSerializedPhp('a:0:{}')).toBe(true);
    expect(isSerializedPhp('at 5:30 {sharp}')).toBe(false);
  });

  it('refuses absurd nesting', () => {
    const deep = 'a:1:{i:0;'.repeat(100) + 'N;' + '}'.repeat(100);
    expect(unserializePhp(deep)).toBeUndefined();
  });
});
