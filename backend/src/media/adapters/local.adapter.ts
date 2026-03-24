import { Injectable } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { StorageAdapter } from './storage.adapter';

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly uploadsDir = resolve(join(process.cwd(), 'uploads'));
  private readonly appUrl = process.env.APP_URL || 'http://localhost:3000';

  /** Local: Multer already saved the file — nothing to do. Return the public URL. */
  async save(_localPath: string, filename: string, _mimetype: string): Promise<string> {
    return this.getUrl(filename);
  }

  async delete(filename: string): Promise<void> {
    const path = join(this.uploadsDir, filename);
    if (existsSync(path)) unlinkSync(path);
  }

  getUrl(filename: string): string {
    return `${this.appUrl}/uploads/${filename}`;
  }
}
