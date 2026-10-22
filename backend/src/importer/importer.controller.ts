import {
  Controller, Get, Param, ParseIntPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ImporterService, MAX_IMPORT_FILE_BYTES } from './importer.service';

const flag = (v?: string) => v === 'true' || v === '1';

@ApiTags('Import')
@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('JWT')
export class ImporterController {
  constructor(private readonly importer: ImporterService) {}

  @Post('wordpress')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } }))
  @ApiOperation({
    summary: 'Import a WordPress export (WXR .xml, max 50 MB). ?dryRun=true only reports what would happen; otherwise queues a background job (Admin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiQuery({ name: 'importMedia', required: false, type: Boolean, description: 'Download attachments into the media library' })
  @ApiQuery({ name: 'overwrite', required: false, type: Boolean, description: 'Update entries whose slug already exists (default: skip them)' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun') dryRun?: string,
    @Query('importMedia') importMedia?: string,
    @Query('overwrite') overwrite?: string,
    @Req() req?: any,
  ) {
    if (flag(dryRun)) return this.importer.dryRun(file?.buffer);
    const user = req?.user ?? {};
    return this.importer.queue(
      file,
      { importMedia: flag(importMedia), overwrite: flag(overwrite) },
      { id: user.id, email: user.email ?? 'admin', role: user.role, ip: req?.ip },
    );
  }

  @Get('wordpress/:jobId')
  @ApiOperation({ summary: 'Status, progress and result of a WordPress import job (Admin only)' })
  status(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.importer.status(jobId);
  }
}
