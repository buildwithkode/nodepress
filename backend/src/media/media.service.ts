import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';

@Injectable()
export class MediaService {
  private readonly uploadsDir = resolve(join(process.cwd(), 'uploads'));

  getFileUrl(filename: string): string {
    return `${process.env.APP_URL || 'http://localhost:3000'}/uploads/${filename}`;
  }

  /**
   * Validate that a filename is safe — no path traversal, no subdirectories.
   * Returns the resolved absolute path only if it's inside uploadsDir.
   */
  private safeResolvePath(filename: string): string {
    // Reject if filename contains path separators or dots that look like traversal
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }

    // Only allow the base name — strip any directory components
    const safe = basename(filename);
    const resolved = resolve(join(this.uploadsDir, safe));

    // Final guard: resolved path must start with uploadsDir
    if (!resolved.startsWith(this.uploadsDir + require('path').sep) &&
        resolved !== this.uploadsDir) {
      throw new BadRequestException('Invalid filename');
    }

    return resolved;
  }

  processUpload(file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return {
      url: this.getFileUrl(file.filename),
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  findAll() {
    if (!existsSync(this.uploadsDir)) return [];

    const files = readdirSync(this.uploadsDir).filter(
      (f) => f !== '.gitkeep',
    );

    const result = [];

    for (const filename of files) {
      const filePath = join(this.uploadsDir, filename);

      try {
        const stats = statSync(filePath);

        // Skip directories
        if (stats.isDirectory()) continue;

        result.push({
          filename,
          url: this.getFileUrl(filename),
          size: stats.size,
          createdAt: stats.birthtime,
        });
      } catch {
        // File was deleted between readdir and statSync — skip it
        continue;
      }
    }

    return result;
  }

  remove(filename: string) {
    // Validate and resolve safe path — throws BadRequestException on traversal
    const filePath = this.safeResolvePath(filename);

    if (!existsSync(filePath)) {
      throw new NotFoundException(`File "${filename}" not found`);
    }

    unlinkSync(filePath);

    return { message: `File "${filename}" deleted successfully` };
  }
}
