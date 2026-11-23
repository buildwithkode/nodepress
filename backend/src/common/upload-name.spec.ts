import { uploadName } from './upload-name';

describe('uploadName', () => {
  const garble = (s: string) => Buffer.from(s, 'utf8').toString('latin1');

  it('restores UTF-8 names that multer read as Latin-1', () => {
    expect(uploadName(garble('Café.png'))).toBe('Café.png');
    expect(uploadName(garble('Screenshot 2026-10-23 at 2.38.15 PM.png'))).toBe('Screenshot 2026-10-23 at 2.38.15 PM.png');
    expect(uploadName(garble('写真.jpg'))).toBe('写真.jpg');
  });

  it('leaves plain, already-decoded and non-UTF-8 names alone', () => {
    expect(uploadName('plain.png')).toBe('plain.png');
    expect(uploadName('写真.jpg')).toBe('写真.jpg');
    expect(uploadName('caf\xe9.png')).toBe('caf\xe9.png');
    expect(uploadName('')).toBe('');
  });
});
