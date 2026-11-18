import {
  Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { EntryNotesService, NOTE_KINDS, NOTE_MAX_LENGTH } from './entry-notes.service';
import { EntryShareService, SHARE_LINK_DAYS } from './entry-share.service';

class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(NOTE_MAX_LENGTH)
  body!: string;

  @IsOptional()
  @IsIn(NOTE_KINDS as unknown as string[])
  kind?: string;
}

class UpdateNoteDto {
  @IsBoolean()
  resolved!: boolean;
}

class CreateShareLinkDto {
  @IsInt()
  @IsIn(SHARE_LINK_DAYS as unknown as number[])
  days!: number;
}

/**
 * Review notes and share links of one entry. Reading notes needs read access to
 * the entry's type; writing them needs update or publish (reviewers often have
 * only publish). Share links show the entry to anyone with the link, so they
 * need update.
 */
@ApiTags('Entries')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entries/:id')
export class EntryReviewController {
  constructor(
    private readonly notes: EntryNotesService,
    private readonly share: EntryShareService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  private async assertMayReview(user: any, id: number) {
    try {
      await this.permissions.assertCanEntries(user, [id], 'update');
    } catch (err) {
      if (!(err instanceof ForbiddenException)) throw err;
      await this.permissions.assertCanEntries(user, [id], 'publish');
    }
  }

  @Get('notes')
  @ApiOperation({ summary: 'Review notes of an entry, oldest first' })
  @ApiParam({ name: 'id', type: Number })
  async listNotes(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.permissions.assertCanEntries(req.user, [id], 'read');
    return this.notes.list(id);
  }

  @Post('notes')
  @ApiOperation({ summary: 'Add a note; kind "changes" is a change request that stays open until resolved' })
  @ApiParam({ name: 'id', type: Number })
  async addNote(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateNoteDto, @Request() req: any) {
    await this.assertMayReview(req.user, id);
    return this.notes.add(id, req.user.id, dto.body, dto.kind ?? 'comment');
  }

  @Patch('notes/:noteId')
  @ApiOperation({ summary: 'Resolve or reopen a note' })
  async updateNote(
    @Param('id', ParseIntPipe) id: number,
    @Param('noteId', ParseIntPipe) noteId: number,
    @Body() dto: UpdateNoteDto,
    @Request() req: any,
  ) {
    await this.assertMayReview(req.user, id);
    return this.notes.setResolved(id, noteId, req.user.id, dto.resolved);
  }

  @Delete('notes/:noteId')
  @ApiOperation({ summary: 'Delete a note (its author or an admin)' })
  async deleteNote(@Param('id', ParseIntPipe) id: number, @Param('noteId', ParseIntPipe) noteId: number, @Request() req: any) {
    await this.permissions.assertCanEntries(req.user, [id], 'read');
    return this.notes.remove(id, noteId, req.user);
  }

  @Get('share-links')
  @ApiOperation({ summary: 'Share links of an entry that still work' })
  async listShareLinks(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    await this.permissions.assertCanEntries(req.user, [id], 'update');
    return this.share.list(id);
  }

  @Post('share-links')
  @ApiOperation({ summary: 'Make a link that shows this entry without a login for 1, 7 or 30 days (the token is shown once)' })
  async createShareLink(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateShareLinkDto, @Request() req: any) {
    await this.permissions.assertCanEntries(req.user, [id], 'update');
    const link = await this.share.create(id, req.user.id, dto.days);
    await this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, 'shared', 'entry', String(id), { days: dto.days, linkId: link.id });
    return link;
  }

  @Delete('share-links/:linkId')
  @ApiOperation({ summary: 'Revoke a share link' })
  async revokeShareLink(@Param('id', ParseIntPipe) id: number, @Param('linkId', ParseIntPipe) linkId: number, @Request() req: any) {
    await this.permissions.assertCanEntries(req.user, [id], 'update');
    const result = await this.share.revoke(id, linkId);
    await this.audit.log({ id: req.user.id, email: req.user.email, ip: req.ip }, 'unshared', 'entry', String(id), { linkId });
    return result;
  }
}
