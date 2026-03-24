import {
  Controller, Post, Get, Delete, Param, Query,
  UseInterceptors, UploadedFile, UseGuards, BadRequestException, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
  ApiParam, ApiConsumes, ApiBody, ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = randomBytes(8).toString('hex');
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /image\/(jpeg|png|gif|webp)|application\/(pdf)|video\/(mp4)/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestException(`File type "${file.mimetype}" not allowed`), false);
  }
};

/** Read first bytes and verify actual file signature vs declared MIME type */
function detectMimeFromBytes(filePath: string): string | null {
  const buf = readFileSync(filePath);
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4';
  return null;
}

const MIME_MAP: Record<string, string> = {
  'image/jpeg': 'image/jpeg', 'image/png': 'image/png',
  'image/gif': 'image/gif',   'image/webp': 'image/webp',
  'application/pdf': 'application/pdf', 'video/mp4': 'video/mp4',
};

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Post('upload')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Upload a file — auto-optimized (images resized + WebP generated)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'File uploaded — returns URL, webpUrl, width, height, size' })
  @UseInterceptors(FileInterceptor('file', { storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: any, @Request() req: any) {
    if (!file) throw new BadRequestException('No file provided');

    // Magic bytes validation — prevent disguised malicious uploads
    const detected = detectMimeFromBytes(file.path);
    if (!detected || detected !== MIME_MAP[file.mimetype]) {
      try { unlinkSync(file.path); } catch { /* ignore */ }
      throw new BadRequestException(
        `File content does not match declared type "${file.mimetype}". Upload rejected.`,
      );
    }

    const actor = req.user
      ? { id: req.user.id, email: req.user.email, ip: req.ip }
      : undefined;

    return this.mediaService.processUpload(file, actor);
  }

  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'List all media files (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '{ data: Media[], meta: { total, page, limit, totalPages } }' })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.mediaService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @Delete(':filename')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a file (also deletes WebP sibling + S3 key)' })
  @ApiParam({ name: 'filename', example: '1234567890-abc123.jpg' })
  remove(@Param('filename') filename: string, @Request() req: any) {
    const actor = req.user
      ? { id: req.user.id, email: req.user.email, ip: req.ip }
      : undefined;
    return this.mediaService.remove(filename, actor);
  }
}
