import { createRequire } from 'module';

// Multer decides whether a request is an upload with its own copy of type-is
// 1.x, which needs media-typer 0.3 / mime-types 2.x next to it. When a lockfile
// lost those nested entries, type-is picked up the hoisted media-typer 1.x and
// answered "not multipart" for every upload, so each one failed with "No file
// provided". This checks the installed tree, so a broken install fails here.
describe('multipart detection (installed multer)', () => {
  const fromMulter = createRequire(require.resolve('multer'));
  const typeis = fromMulter('type-is');

  it('recognises a multipart/form-data upload', () => {
    const req = { headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '10' } };
    expect(typeis(req, ['multipart'])).toBe('multipart');
  });

  it('still rejects a JSON body', () => {
    const req = { headers: { 'content-type': 'application/json', 'content-length': '2' } };
    expect(typeis(req, ['multipart'])).toBe(false);
  });
});
