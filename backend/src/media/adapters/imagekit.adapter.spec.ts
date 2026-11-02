import { mkdtempSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ImageKitStorageAdapter, normalizeImageKitFolder } from './imagekit.adapter';

const KEY = 'private_secret_key';
const config = { privateKey: KEY, urlEndpoint: 'https://ik.imagekit.io/acme/', folder: '/site/media/' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ImageKitStorageAdapter', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch'); });
  afterEach(() => jest.restoreAllMocks());

  const tempFile = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ik-')), 'a.jpg');
    writeFileSync(path, 'bytes');
    return path;
  };

  it('refuses to start without its settings', () => {
    expect(() => new ImageKitStorageAdapter({ urlEndpoint: 'https://ik.imagekit.io/x' })).toThrow(/PRIVATE_KEY/);
    expect(() => new ImageKitStorageAdapter({ privateKey: KEY })).toThrow(/URL_ENDPOINT/);
  });

  it('builds links from the endpoint, folder and file name', () => {
    expect(new ImageKitStorageAdapter(config).getUrl('a.jpg')).toBe('https://ik.imagekit.io/acme/site/media/a.jpg');
    expect(new ImageKitStorageAdapter({ ...config, folder: null }).getUrl('a.jpg')).toBe('https://ik.imagekit.io/acme/a.jpg');
  });

  it('uploads under the given name, removes the temp file and returns the link', async () => {
    fetchMock.mockResolvedValue(json({ fileId: 'f1' }));
    const path = tempFile();
    const url = await new ImageKitStorageAdapter(config).save(path, 'a.jpg', 'image/jpeg');

    expect(url).toBe('https://ik.imagekit.io/acme/site/media/a.jpg');
    expect(existsSync(path)).toBe(false);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe('https://upload.imagekit.io/api/v1/files/upload');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY}:`).toString('base64')}`);
    const form = init.body as FormData;
    expect(form.get('fileName')).toBe('a.jpg');
    expect(form.get('useUniqueFileName')).toBe('false');
    expect(form.get('folder')).toBe('/site/media');
  });

  it('keeps the temp file and hides the provider error when an upload fails', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Your account cannot be authenticated' }, 401));
    const path = tempFile();
    await expect(new ImageKitStorageAdapter(config).save(path, 'a.jpg', 'image/jpeg')).rejects.toThrow('File storage failed');
    expect(existsSync(path)).toBe(true);
  });

  it('never sends the private key to the configured URL endpoint', async () => {
    fetchMock.mockResolvedValue(json({ fileId: 'f1' }));
    await new ImageKitStorageAdapter(config).save(tempFile(), 'a.jpg', 'image/jpeg');
    for (const [target] of fetchMock.mock.calls) expect(String(target)).not.toContain('ik.imagekit.io');
  });

  it('deletes by the id of the file with exactly that name and folder', async () => {
    fetchMock
      .mockResolvedValueOnce(json([
        { fileId: 'other', name: 'a.jpg', filePath: '/elsewhere/a.jpg' },
        { fileId: 'right', name: 'a.jpg', filePath: '/site/media/a.jpg' },
      ]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await new ImageKitStorageAdapter(config).delete('a.jpg');

    const search = new URL(fetchMock.mock.calls[0][0]);
    expect(search.searchParams.get('searchQuery')).toBe('name = "a.jpg"');
    expect(search.searchParams.get('path')).toBe('/site/media/');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.imagekit.io/v1/files/right');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('deletes nothing when no file matches, and a failed delete does not throw', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await new ImageKitStorageAdapter(config).delete('gone.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json({ message: 'nope' }, 500));
    await expect(new ImageKitStorageAdapter(config).delete('a.jpg')).resolves.toBeUndefined();
  });

  it('test() uploads, deletes, and reports an endpoint from another account', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ fileId: 't1', url: 'https://ik.imagekit.io/acme/site/media/x.png' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(ImageKitStorageAdapter.test(config)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.imagekit.io/v1/files/t1');

    fetchMock
      .mockResolvedValueOnce(json({ fileId: 't2', url: 'https://ik.imagekit.io/someone_else/x.png' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(ImageKitStorageAdapter.test(config)).rejects.toThrow(/doesn't match this account/);
    expect(fetchMock.mock.calls[3][0]).toBe('https://api.imagekit.io/v1/files/t2');
  });

  it('test() accepts a custom domain, which ImageKit does not echo back', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ fileId: 't1', url: 'https://ik.imagekit.io/acme/x.png' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(ImageKitStorageAdapter.test({ ...config, urlEndpoint: 'https://media.example.com' })).resolves.toBeUndefined();
  });

  it('refuses folders that climb out of the path', () => {
    expect(normalizeImageKitFolder(' /a/b/ ')).toBe('a/b');
    expect(() => normalizeImageKitFolder('a/../b')).toThrow();
  });
});
