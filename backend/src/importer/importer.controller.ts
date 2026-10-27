import {
  Controller, Get, Param, ParseIntPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Access } from '../auth/decorators/access.decorator';
import { ImporterService, MAX_IMPORT_FILE_BYTES } from './importer.service';

const flag = (v?: string) => v === 'true' || v === '1';

@ApiTags('Import')
@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Access('import', 'view')
@ApiBearerAuth('JWT')
export class ImporterController {
  constructor(private readonly importer: ImporterService) {}

  @Access('import', 'edit')
  @Post('wordpress')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } }))
  @ApiOperation({
    summary: 'Import a WordPress export (WXR .xml, max 50 MB). ?dryRun=true only reports what would happen; otherwise queues a background job (Admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiQuery({ name: 'importMedia', required: false, type: Boolean, description: 'Download attachments into the media library' })
  @ApiQuery({ name: 'overwrite', required: false, type: Boolean, description: 'Update entries whose slug already exists (default: skip them)' })
  @ApiQuery({ name: 'categoryPaths', required: false, type: Boolean, description: 'Add a category_paths field with full "Parent/Child" paths' })
  @ApiQuery({ name: 'taxonomies', required: false, type: Boolean, description: 'Add a taxonomies field ({ taxonomy: [terms] }) for custom taxonomies' })
  @ApiQuery({ name: 'authors', required: false, type: Boolean, description: 'Import wp:author as wp_author entries (no email, never login accounts) and link posts via author_ref' })
  @ApiQuery({ name: 'comments', required: false, type: Boolean, description: 'Import approved comments as wp_comment entries (no email or IP)' })
  @ApiQuery({ name: 'pendingComments', required: false, type: Boolean, description: 'With comments: include pending comments (as pending_review)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun') dryRun?: string,
    @Query('importMedia') importMedia?: string,
    @Query('overwrite') overwrite?: string,
    @Query('categoryPaths') categoryPaths?: string,
    @Query('taxonomies') taxonomies?: string,
    @Query('authors') authors?: string,
    @Query('comments') comments?: string,
    @Query('pendingComments') pendingComments?: string,
    @Req() req?: any,
  ) {
    const extras = {
      categoryPaths: flag(categoryPaths), taxonomies: flag(taxonomies), authors: flag(authors),
      comments: flag(comments), pendingComments: flag(pendingComments),
    };
    if (flag(dryRun)) return this.importer.dryRun(file?.buffer, extras);
    const user = req?.user ?? {};
    return this.importer.queue(
      file,
      { importMedia: flag(importMedia), overwrite: flag(overwrite), ...extras },
      { id: user.id, email: user.email ?? 'admin', role: user.role, ip: req?.ip },
    );
  }

  @Get('wordpress/:jobId')
  @ApiOperation({ summary: 'Status, progress and result of a WordPress import job (Admin only)' })
  status(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.importer.status(jobId);
  }
}
