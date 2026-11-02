import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { readFile } from 'fs/promises';
import { StorageAdapter } from './storage.adapter';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const FILES_URL = 'https://api.imagekit.io/v1/files';
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
const API_TIMEOUT_MS = 30_000;

/** 1×1 transparent PNG: ImageKit stores images, so the connection test sends one. */
const TEST_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** ImageKit storage settings, from STORAGE_IMAGEKIT_* env vars or saved in the admin. */
export interface ImageKitConfig {
  privateKey?: string;
  /** The account's URL endpoint, such as https://ik.imagekit.io/your_id, or a custom domain. */
  urlEndpoint?: string;
  /** Folder inside the media library. Empty means the root. */
  folder?: string | null;
}

export function imageKitConfigFromEnv(): ImageKitConfig {
  return {
    privateKey: process.env.STORAGE_IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.STORAGE_IMAGEKIT_URL_ENDPOINT,
    folder: process.env.STORAGE_IMAGEKIT_FOLDER,
  };
}

/** "/a/b/" → "a/b". Refuses ".." so a typed folder can't climb out of the path. */
export function normalizeImageKitFolder(folder?: string | null): string {
  const clean = (folder ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (clean.split('/').some((part) => part === '..' || part === '.')) {
    throw new InternalServerErrorException('The ImageKit folder can\'t contain "." or ".." parts');
  }
  return clean;
}

/**
 * Stores uploads in ImageKit's media library. The upload and files API hosts are
 * fixed here: the configured URL endpoint only builds public links and is never
 * sent the private key.
 *
 * Deleting a file doesn't purge ImageKit's CDN, so a deleted file's link can keep
 * working until its cached copy expires.
 */
@Injectable()
export class ImageKitStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(ImageKitStorageAdapter.name);
  private readonly auth: string;
  private readonly urlEndpoint: string;
  private readonly folder: string;

  constructor(config: ImageKitConfig = imageKitConfigFromEnv()) {
    const { privateKey, urlEndpoint } = config;
    if (!privateKey || !urlEndpoint) {
      throw new InternalServerErrorException(
        'ImageKit storage requires STORAGE_IMAGEKIT_PRIVATE_KEY and STORAGE_IMAGEKIT_URL_ENDPOINT',
      );
    }
    this.auth = `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`;
    this.urlEndpoint = urlEndpoint.trim().replace(/\/+$/, '');
    this.folder = normalizeImageKitFolder(config.folder);
  }

  /** Upload and delete a tiny image with these settings. Throws with ImageKit's error. */
  static async test(config: ImageKitConfig): Promise<void> {
    const adapter = new ImageKitStorageAdapter(config);
    const name = `nodepress-storage-test-${Date.now().toString(36)}.png`;
    const uploaded = await adapter.upload(Buffer.from(TEST_PNG, 'base64'), name, 'image/png');
    try {
      // A wrong URL endpoint uploads fine and then breaks every image, so catch it here.
      // Custom domains can't be compared: ImageKit answers with its own default address.
      const custom = !/(^|\.)imagekit\.io$/i.test(new URL(adapter.urlEndpoint).hostname);
      if (!custom && uploaded.url && !uploaded.url.startsWith(`${adapter.urlEndpoint}/`)) {
        throw new Error(`The URL endpoint doesn't match this account: ImageKit stored the file at ${uploaded.url}`);
      }
    } finally {
      await adapter.deleteById(uploaded.fileId);
    }
  }

  async save(localPath: string, filename: string, mimetype: string): Promise<string> {
    try {
      // Multer has already enforced MEDIA_MAX_MB, so this read is bounded.
      await this.upload(await readFile(localPath), filename, mimetype);
      this.logger.log(`Uploaded ${filename} to ImageKit`);
    } catch (err) {
      this.logger.error(`ImageKit upload failed for ${filename}: ${err}`);
      throw new InternalServerErrorException('File storage failed. Please try again.');
    }
    if (existsSync(localPath)) {
      try { unlinkSync(localPath); } catch { /* best-effort cleanup */ }
    }
    return this.getUrl(filename);
  }

  async delete(filename: string): Promise<void> {
    try {
      const fileId = await this.findFileId(filename);
      if (!fileId) {
        this.logger.warn(`ImageKit has no file named ${filename} to delete`);
        return;
      }
      await this.deleteById(fileId);
      this.logger.log(`Deleted ${filename} from ImageKit`);
    } catch (err) {
      this.logger.error(`ImageKit delete failed for ${filename}: ${err}`);
    }
  }

  getUrl(filename: string): string {
    return [this.urlEndpoint, this.folder, filename].filter(Boolean).join('/');
  }

  private async upload(bytes: Buffer, filename: string, mimetype: string) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mimetype }), filename);
    form.append('fileName', filename);
    // NodePress names files itself and builds their links from that name.
    form.append('useUniqueFileName', 'false');
    if (this.folder) form.append('folder', `/${this.folder}`);
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: this.auth },
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(await errorText(res));
    return (await res.json()) as { fileId: string; url?: string };
  }

  /** ImageKit deletes by its own id, so look the file up by name and folder first. */
  private async findFileId(filename: string): Promise<string | null> {
    const query = new URLSearchParams({
      searchQuery: `name = "${filename.replace(/["\\]/g, '')}"`,
      path: this.folder ? `/${this.folder}/` : '/',
      type: 'file',
      limit: '10',
    });
    const res = await fetch(`${FILES_URL}?${query}`, {
      headers: { Authorization: this.auth },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(await errorText(res));
    const files = (await res.json()) as { fileId: string; name: string; filePath?: string }[];
    const expected = `/${[this.folder, filename].filter(Boolean).join('/')}`;
    return files.find((f) => f.name === filename && (!f.filePath || f.filePath === expected))?.fileId ?? null;
  }

  private async deleteById(fileId: string): Promise<void> {
    const res = await fetch(`${FILES_URL}/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: this.auth },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 404) throw new Error(await errorText(res));
  }
}

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ? `ImageKit: ${body.message}` : `ImageKit answered ${res.status}`;
}
