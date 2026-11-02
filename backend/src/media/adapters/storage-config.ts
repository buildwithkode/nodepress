import { open } from '../../common/secret-box';
import { ImageKitConfig, ImageKitStorageAdapter, imageKitConfigFromEnv } from './imagekit.adapter';
import { LocalStorageAdapter } from './local.adapter';
import { r2ConfigFromEnv, S3Config, S3StorageAdapter, s3ConfigFromEnv } from './s3.adapter';
import { StorageAdapter } from './storage.adapter';

export const STORAGE_DRIVERS = ['local', 's3', 'r2', 'imagekit'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export const isStorageDriver = (v: unknown): v is StorageDriver => STORAGE_DRIVERS.includes(v as StorageDriver);

/** S3 and R2 share one kind of key, so a saved secret carries over between them, and never to ImageKit. */
export const sameStorageSecret = (a: unknown, b: unknown) =>
  a === b || ((a === 's3' || a === 'r2') && (b === 's3' || b === 'r2'));

/** Saved storage settings (Setting.storage) → S3 config, or null when not set up for S3. */
export function s3FromSaved(saved: unknown): S3Config | null {
  const st = saved as Record<string, any> | null | undefined;
  if (!st || st.driver !== 's3' || !st.bucket || !st.accessKey) return null;
  const secretKey = open(st.secretKey);
  if (!secretKey) return null;
  return { bucket: st.bucket, region: st.region, accessKey: st.accessKey, secretKey, endpoint: st.endpoint, publicUrl: st.publicUrl };
}

/** Saved storage settings → R2's S3 config, or null when not set up for R2. */
export function r2FromSaved(saved: unknown): S3Config | null {
  const st = saved as Record<string, any> | null | undefined;
  if (!st || st.driver !== 'r2' || !st.accountId || !st.bucket || !st.accessKey || !st.publicUrl) return null;
  const secretKey = open(st.secretKey);
  if (!secretKey) return null;
  return r2Config({ accountId: st.accountId, bucket: st.bucket, accessKey: st.accessKey, secretKey, publicUrl: st.publicUrl });
}

/** Saved storage settings → ImageKit config, or null when not set up for ImageKit. */
export function imageKitFromSaved(saved: unknown): ImageKitConfig | null {
  const st = saved as Record<string, any> | null | undefined;
  if (!st || st.driver !== 'imagekit' || !st.urlEndpoint) return null;
  const privateKey = open(st.secretKey);
  if (!privateKey) return null;
  return { privateKey, urlEndpoint: st.urlEndpoint, folder: st.folder };
}

/** R2 is S3-compatible: its endpoint comes from the account id and its region is always "auto". */
export function r2Config(o: { accountId: string; bucket?: string; accessKey?: string; secretKey?: string; publicUrl?: string }): S3Config {
  return {
    bucket: o.bucket,
    accessKey: o.accessKey,
    secretKey: o.secretKey,
    publicUrl: o.publicUrl,
    region: 'auto',
    endpoint: `https://${o.accountId}.r2.cloudflarestorage.com`,
    r2: true,
  };
}

/** The adapter STORAGE_DRIVER asks for. */
export function adapterFromEnv(driver: StorageDriver): StorageAdapter {
  if (driver === 's3') return new S3StorageAdapter(s3ConfigFromEnv());
  if (driver === 'r2') return new S3StorageAdapter(r2ConfigFromEnv());
  if (driver === 'imagekit') return new ImageKitStorageAdapter(imageKitConfigFromEnv());
  return new LocalStorageAdapter();
}

/** The adapter the admin's saved settings ask for, or null when they aren't complete or readable. */
export function adapterFromSaved(saved: unknown): { driver: StorageDriver; adapter: StorageAdapter } | null {
  const s3 = s3FromSaved(saved);
  if (s3) return { driver: 's3', adapter: new S3StorageAdapter(s3) };
  const r2 = r2FromSaved(saved);
  if (r2) return { driver: 'r2', adapter: new S3StorageAdapter(r2) };
  const imageKit = imageKitFromSaved(saved);
  if (imageKit) return { driver: 'imagekit', adapter: new ImageKitStorageAdapter(imageKit) };
  return null;
}
