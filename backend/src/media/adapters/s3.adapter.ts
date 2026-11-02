import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'fs';
import { StorageAdapter } from './storage.adapter';

/** S3-compatible storage settings, from STORAGE_S3_* env vars or saved in the admin. */
export interface S3Config {
  bucket?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  endpoint?: string;
  publicUrl?: string;
  /** Cloudflare R2: no object ACLs, and only the checksums a request must have. */
  r2?: boolean;
}

export function s3ConfigFromEnv(): S3Config {
  return {
    bucket: process.env.STORAGE_S3_BUCKET,
    region: process.env.STORAGE_S3_REGION,
    accessKey: process.env.STORAGE_S3_ACCESS_KEY,
    secretKey: process.env.STORAGE_S3_SECRET_KEY,
    endpoint: process.env.STORAGE_S3_ENDPOINT,
    publicUrl: process.env.STORAGE_S3_PUBLIC_URL,
  };
}

/**
 * STORAGE_DRIVER=r2 uses the STORAGE_S3_* keys. The endpoint comes from
 * STORAGE_R2_ACCOUNT_ID, or from STORAGE_S3_ENDPOINT when that's set instead.
 */
export function r2ConfigFromEnv(): S3Config {
  const accountId = process.env.STORAGE_R2_ACCOUNT_ID;
  return {
    ...s3ConfigFromEnv(),
    region: 'auto',
    endpoint: process.env.STORAGE_S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined),
    r2: true,
  };
}

/**
 * S3-compatible storage adapter.
 * Works with: AWS S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces.
 *
 * Required env vars:
 *   STORAGE_S3_BUCKET       — bucket name
 *   STORAGE_S3_REGION       — region (use "auto" for Cloudflare R2)
 *   STORAGE_S3_ACCESS_KEY   — access key ID
 *   STORAGE_S3_SECRET_KEY   — secret access key
 *
 * Optional env vars:
 *   STORAGE_S3_ENDPOINT     — custom endpoint for R2/MinIO (e.g. https://{accountId}.r2.cloudflarestorage.com)
 *   STORAGE_S3_PUBLIC_URL   — CDN/public domain (e.g. https://assets.yourdomain.com)
 *                             If not set, falls back to virtual-hosted-style S3 URL.
 */
@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly acl: boolean;

  constructor(config: S3Config = s3ConfigFromEnv()) {
    const { bucket, accessKey, secretKey, endpoint } = config;
    const region = config.region || 'us-east-1';

    if (!bucket || !accessKey || !secretKey) {
      throw new InternalServerErrorException(
        'S3 storage requires STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY, and STORAGE_S3_SECRET_KEY env vars',
      );
    }

    // R2's API address doesn't serve files, so a link built from it would never load.
    if (config.r2 && (!endpoint || !config.publicUrl)) {
      throw new InternalServerErrorException(
        'Cloudflare R2 storage needs an account id (or endpoint) and a public URL for the bucket',
      );
    }

    this.bucket = bucket;
    this.acl = !config.r2;
    this.client = new S3Client({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(config.r2 ? { requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' } as const : {}),
    });

    // Public URL: use custom CDN domain or build from endpoint/bucket
    this.publicUrl =
      config.publicUrl?.replace(/\/$/, '') ||
      (endpoint
        ? `${endpoint.replace(/\/$/, '')}/${bucket}`
        : `https://${bucket}.s3.${region}.amazonaws.com`);
  }

  /** Write and delete a small object with these settings. Throws with the provider's error. */
  static async test(config: S3Config): Promise<void> {
    const adapter = new S3StorageAdapter(config);
    const key = `.nodepress-storage-test-${Date.now().toString(36)}.txt`;
    await adapter.client.send(new PutObjectCommand({ Bucket: adapter.bucket, Key: key, Body: 'ok', ContentType: 'text/plain' }));
    await adapter.client.send(new DeleteObjectCommand({ Bucket: adapter.bucket, Key: key }));
  }

  async save(localPath: string, filename: string, mimetype: string): Promise<string> {
    try {
      // Stream local file → S3 (handles multipart automatically for large files)
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: filename,
          Body: createReadStream(localPath),
          ContentType: mimetype,
          // Public read — remove if using signed URLs. R2 has no object ACLs:
          // its bucket is made public in Cloudflare.
          ...(this.acl ? { ACL: 'public-read' as any } : {}),
        },
      });

      await upload.done();
      this.logger.log(`Uploaded ${filename} to S3`);

      // Delete the local temp file after successful upload
      if (existsSync(localPath)) {
        try { unlinkSync(localPath); } catch { /* best-effort cleanup */ }
      }

      return this.getUrl(filename);
    } catch (err) {
      this.logger.error(`S3 upload failed for ${filename}: ${err}`);
      throw new InternalServerErrorException('File storage failed. Please try again.');
    }
  }

  async delete(filename: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: filename }),
      );
      this.logger.log(`Deleted ${filename} from S3`);
    } catch (err) {
      this.logger.error(`S3 delete failed for ${filename}: ${err}`);
    }
  }

  getUrl(filename: string): string {
    return `${this.publicUrl}/${filename}`;
  }
}
