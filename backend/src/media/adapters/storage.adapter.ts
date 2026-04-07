/**
 * Pluggable storage backend interface.
 *
 * Switch drivers via env var:
 *   STORAGE_DRIVER=local   (default) — saves to backend/uploads/
 *   STORAGE_DRIVER=s3      — uploads to any S3-compatible endpoint (AWS, R2, MinIO, B2)
 */
export const STORAGE_ADAPTER = 'STORAGE_ADAPTER';

export interface StorageAdapter {
  /**
   * Persist a file that Multer already saved to `localPath`.
   * - Local: no-op (already on disk), returns the public URL.
   * - S3: streams to bucket, deletes the temp local file, returns S3/CDN URL.
   */
  save(localPath: string, filename: string, mimetype: string): Promise<string>;

  /** Remove a file from storage. */
  delete(filename: string): Promise<void>;

  /** Build the public URL for a given filename/key. */
  getUrl(filename: string): string;
}
