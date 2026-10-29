import {
  Controller, Post, Get, Put, Delete, Param, Query, Body,
  UseInterceptors, UploadedFile, UseGuards, BadRequestException, NotFoundException, ParseIntPipe, Request, Res, Headers,
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
import { readFileSync, unlinkSync, createReadStream } from 'fs';
import { MediaService } from './media.service';
import { ImageTransformService } from './image-transform.service';
import { looksLikeSvg } from './svg-sanitize';
import { maxUploadBytes } from './upload-limits';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = randomBytes(8).toString('hex');
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /^(image\/(jpeg|png|gif|webp|svg\+xml)|application\/pdf|video\/mp4)$/;
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
  if (looksLikeSvg(buf.subarray(0, 4096))) return 'image/svg+xml'; // sanitized in MediaService.processUpload
  return null;
}

const MIME_MAP: Record<string, string> = {
  'image/jpeg': 'image/jpeg', 'image/png': 'image/png',
  'image/gif': 'image/gif',   'image/webp': 'image/webp',
  'application/pdf': 'application/pdf', 'video/mp4': 'video/mp4',
  'image/svg+xml': 'image/svg+xml',
};

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly imageTransform: ImageTransformService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Post('upload')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Upload a file — auto-optimized (images resized + WebP generated)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'File uploaded — returns URL, webpUrl, width, height, size' })
  @UseInterceptors(FileInterceptor('file', { storage, fileFilter, limits: { fileSize: maxUploadBytes() } }))
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
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List media files (paginated, optional folder filter) — signed-in users' })
  @ApiQuery({ name: 'page',     required: false, type: Number })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'folderId', required: false, type: Number, description: 'Filter by folder ID. Omit for all files, use "null" for unfiled.' })
  @ApiResponse({ status: 200, description: '{ data: Media[], meta: { total, page, limit, totalPages } }' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('folderId') folderId?: string,
  ) {
    let folderIdParsed: number | null | undefined;
    if (folderId === 'null') folderIdParsed = null;
    else if (folderId !== undefined) folderIdParsed = parseInt(folderId, 10);

    return this.mediaService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      folderIdParsed,
    );
  }

  // ── Folder endpoints — MUST be before :filename wildcard ──────────────────

  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get('folders')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all media folders (flat list, build tree from parentId)' })
  listFolders() {
    return this.mediaService.listFolders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Post('folders')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a media folder' })
  @ApiResponse({ status: 201, description: 'Folder created' })
  createFolder(
    @Body('name') name: string,
    @Body('parentId') parentId?: number,
  ) {
    return this.mediaService.createFolder(name, parentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Put('folders/:id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Rename a media folder' })
  @ApiParam({ name: 'id', type: Number })
  renameFolder(
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
  ) {
    return this.mediaService.renameFolder(id, name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Delete('folders/:id')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a folder (cascades to sub-folders; files become unfiled)' })
  @ApiParam({ name: 'id', type: Number })
  deleteFolder(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.deleteFolder(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Put(':filename/folder')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Move a file into a folder (or to root with folderId: null)' })
  @ApiParam({ name: 'filename', example: '1234567890-abc123.jpg' })
  moveToFolder(
    @Param('filename') filename: string,
    @Body('folderId') folderId: number | null,
  ) {
    return this.mediaService.moveToFolder(filename, folderId ?? null);
  }

  // ── Dynamic Image Resizing & WebP/Avif Transformation Pipeline ───────────

  @SkipThrottle()
  @Get(':filename/transform')
  @ApiOperation({
    summary: 'Resize / convert an image on the fly (cached)',
    description:
      'Width and height are rounded up to a fixed set of sizes (16…3840), quality to steps of 10 (30–100), ' +
      'so each image has a bounded number of variants. format=auto picks AVIF or WebP from the Accept header. ' +
      'fit=cover with both w and h crops around the image\'s focal point. Works with local and S3 storage.',
  })
  @ApiParam({ name: 'filename', example: '1234567890-abc123.jpg' })
  @ApiQuery({ name: 'w', required: false, type: Number, description: 'Target width (px), rounded up to the next size bucket' })
  @ApiQuery({ name: 'h', required: false, type: Number, description: 'Target height (px), rounded up to the next size bucket' })
  @ApiQuery({ name: 'q', required: false, type: Number, description: 'Quality 30-100 in steps of 10 (default 80)' })
  @ApiQuery({ name: 'format', required: false, enum: ['auto', 'webp', 'avif', 'jpeg', 'png'] })
  @ApiQuery({ name: 'fit', required: false, enum: ['cover', 'contain', 'fill', 'inside', 'outside'] })
  @ApiQuery({ name: 'fp', required: false, description: 'The image\'s focal point "x,y" — pins the URL so it can be cached forever' })
  async transform(
    @Param('filename') filename: string,
    @Query() query: Record<string, string>,
    @Headers('accept') accept: string | undefined,
    @Res() res: any,
  ) {
    // SVGs scale on their own and are never rasterized: send the file itself.
    if (extname(filename).toLowerCase() === '.svg') {
      const url = await this.mediaService.urlOf(filename);
      if (!url) throw new NotFoundException('File not found');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, url);
    }
    const result = await this.imageTransform.transform(
      filename,
      { w: query.w, h: query.h, q: query.q, format: query.format, fit: query.fit, fp: query.fp },
      accept,
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Length': result.size,
      'Cache-Control': result.cacheControl,
      ...(result.vary ? { Vary: result.vary } : {}),
    });
    createReadStream(result.filePath).pipe(res);
  }

  @SkipThrottle()
  @Get(':filename/resize')
  @ApiOperation({ summary: 'Alias for :filename/transform' })
  resize(
    @Param('filename') filename: string,
    @Query() query: Record<string, string>,
    @Headers('accept') accept: string | undefined,
    @Res() res: any,
  ) {
    return this.transform(filename, query, accept, res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
  @Put(':filename/focal-point')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set (or clear with nulls) the focal point used for cover crops' })
  @ApiParam({ name: 'filename', example: '1234567890-abc123.jpg' })
  setFocalPoint(
    @Param('filename') filename: string,
    @Body('x') x: number | null,
    @Body('y') y: number | null,
  ) {
    return this.mediaService.setFocalPoint(filename, x, y);
  }

  // ── File delete — must come after all static /folders/* routes ─────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Access('media', 'edit')
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
