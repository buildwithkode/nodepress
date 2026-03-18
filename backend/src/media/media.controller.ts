import {
  Controller, Post, Get, Delete, Param,
  UseInterceptors, UploadedFile, UseGuards, BadRequestException,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
  ApiParam, ApiConsumes, ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = randomBytes(8).toString('hex');
    const ext = extname(file.originalname);
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

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Upload a file (image, PDF, MP4 — max 10MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded, returns URL and metadata' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: any) {
    return this.mediaService.processUpload(file);
  }

  @Get()
  @ApiOperation({ summary: 'List all uploaded files (public)' })
  @ApiResponse({ status: 200, description: 'Array of file metadata' })
  findAll() {
    return this.mediaService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':filename')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete an uploaded file' })
  @ApiParam({ name: 'filename', example: '1234567890-abc123.jpg' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  @ApiResponse({ status: 404, description: 'File not found' })
  remove(@Param('filename') filename: string) {
    return this.mediaService.remove(filename);
  }
}
