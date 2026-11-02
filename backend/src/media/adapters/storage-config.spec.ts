import { seal } from '../../common/secret-box';
import { ImageKitStorageAdapter } from './imagekit.adapter';
import { S3StorageAdapter } from './s3.adapter';
import { adapterFromSaved, imageKitFromSaved, r2Config, r2FromSaved, s3FromSaved, sameStorageSecret } from './storage-config';

const ACCOUNT = 'a'.repeat(32);
const r2 = { driver: 'r2', accountId: ACCOUNT, bucket: 'b', accessKey: 'k', secretKey: seal('s'), publicUrl: 'https://media.example.com' };

describe('storage-config', () => {
  it('builds R2 settings from the account id', () => {
    const c = r2FromSaved(r2)!;
    expect(c.endpoint).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(c.region).toBe('auto');
    expect(c.r2).toBe(true);
    expect(c.secretKey).toBe('s');
  });

  it('R2 links use the public URL, never the API address', () => {
    expect(new S3StorageAdapter(r2FromSaved(r2)!).getUrl('a.jpg')).toBe('https://media.example.com/a.jpg');
  });

  it('refuses R2 without a public URL', () => {
    expect(r2FromSaved({ ...r2, publicUrl: null })).toBeNull();
    expect(() => new S3StorageAdapter(r2Config({ accountId: ACCOUNT, bucket: 'b', accessKey: 'k', secretKey: 's' }))).toThrow(/public URL/);
  });

  it('picks the adapter for the saved driver', () => {
    expect(adapterFromSaved(r2)?.driver).toBe('r2');
    expect(adapterFromSaved(r2)?.adapter).toBeInstanceOf(S3StorageAdapter);

    const ik = adapterFromSaved({ driver: 'imagekit', urlEndpoint: 'https://ik.imagekit.io/x', secretKey: seal('p') });
    expect(ik?.driver).toBe('imagekit');
    expect(ik?.adapter).toBeInstanceOf(ImageKitStorageAdapter);

    expect(adapterFromSaved({ driver: 's3', bucket: 'b', accessKey: 'k', secretKey: seal('s') })?.driver).toBe('s3');
    expect(adapterFromSaved({ driver: 'local' })).toBeNull();
    expect(adapterFromSaved(null)).toBeNull();
  });

  it('falls back when a saved secret is missing or unreadable', () => {
    expect(r2FromSaved({ ...r2, secretKey: null })).toBeNull();
    expect(imageKitFromSaved({ driver: 'imagekit', urlEndpoint: 'https://x.io', secretKey: 'not-sealed' })).toBeNull();
    expect(s3FromSaved({ driver: 's3', bucket: 'b', accessKey: 'k' })).toBeNull();
  });

  it('a saved secret carries between S3 and R2 only', () => {
    expect(sameStorageSecret('s3', 'r2')).toBe(true);
    expect(sameStorageSecret('r2', 'r2')).toBe(true);
    expect(sameStorageSecret('s3', 'imagekit')).toBe(false);
    expect(sameStorageSecret('imagekit', 'r2')).toBe(false);
    expect(sameStorageSecret('imagekit', 'imagekit')).toBe(true);
  });
});
