import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** A note's kind: a plain comment, or a change request that stays open until resolved. */
export const NOTE_KINDS = ['comment', 'changes'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const NOTE_MAX_LENGTH = 2000;

/** Statuses that answer a change request: sent back to review, or published. */
const RESOLVING_STATUSES = new Set(['pending_review', 'published']);

/** Entry ids named by a Prisma `where.id` (a number, or `{ in: [...] }`). */
export function entryIdsOf(where: any): number[] {
  const id = where?.id;
  if (Number.isInteger(id)) return [id];
  if (Array.isArray(id?.in)) return id.in.filter((n: unknown) => Number.isInteger(n));
  return [];
}

/**
 * Review notes on an entry. Reviewers leave a "changes" note when sending work
 * back; it shows in the editor and the entries list until someone resolves it,
 * or the entry goes back to review or is published (from anywhere: the editor,
 * the list, bulk actions, releases, the scheduler — see onModuleInit).
 */
@Injectable()
export class EntryNotesService implements OnModuleInit {
  private readonly logger = new Logger(EntryNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.prisma.onOperation(async (params, next) => {
      const result = await next(params);
      if (params.model === 'Entry' && (params.action === 'update' || params.action === 'updateMany')) {
        const status = params.args?.data?.status;
        if (typeof status === 'string' && RESOLVING_STATUSES.has(status)) {
          const ids = entryIdsOf(params.args?.where);
          if (ids.length) {
            await this.resolveOpen(ids).catch((err) => this.logger.warn(`Could not resolve change requests: ${err?.message ?? err}`));
          }
        }
      }
      return result;
    });
  }

  /** Close the open change requests of these entries (no resolver: the status change did it). */
  async resolveOpen(entryIds: number[]) {
    await this.prisma.entryNote.updateMany({
      where: { entryId: { in: entryIds }, kind: 'changes', resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async list(entryId: number) {
    const notes = await this.prisma.entryNote.findMany({ where: { entryId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const userIds = [...new Set(notes.flatMap((n) => [n.userId, n.resolvedBy]).filter((n): n is number => n != null))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const nameOf = (id: number | null) => {
      if (id == null) return null;
      const u = users.find((x) => x.id === id);
      return u ? { id: u.id, name: u.name?.trim() || u.email.split('@')[0] } : { id, name: null };
    };
    return notes.map((n) => ({
      id: n.id,
      kind: n.kind,
      body: n.body,
      createdAt: n.createdAt,
      resolvedAt: n.resolvedAt,
      author: nameOf(n.userId),
      resolvedBy: nameOf(n.resolvedBy),
    }));
  }

  async add(entryId: number, userId: number, body: string, kind: string = 'comment') {
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) throw new BadRequestException('A note needs some text');
    if (text.length > NOTE_MAX_LENGTH) throw new BadRequestException(`A note can be at most ${NOTE_MAX_LENGTH} characters`);
    if (!(NOTE_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`kind must be one of: ${NOTE_KINDS.join(', ')}`);
    const entry = await this.prisma.entry.findFirst({ where: { id: entryId, deletedAt: null }, select: { id: true } });
    if (!entry) throw new NotFoundException(`Entry #${entryId} not found`);
    await this.prisma.entryNote.create({ data: { entryId, userId, kind, body: text } });
    return this.list(entryId);
  }

  async setResolved(entryId: number, noteId: number, userId: number, resolved: boolean) {
    await this.find(entryId, noteId);
    await this.prisma.entryNote.update({
      where: { id: noteId },
      data: resolved ? { resolvedAt: new Date(), resolvedBy: userId } : { resolvedAt: null, resolvedBy: null },
    });
    return this.list(entryId);
  }

  /** Authors delete their own notes; admins any. */
  async remove(entryId: number, noteId: number, user: { id: number; role: string }) {
    const note = await this.find(entryId, noteId);
    if (note.userId !== user.id && user.role !== 'admin') throw new ForbiddenException('Only the author or an admin can delete a note');
    await this.prisma.entryNote.delete({ where: { id: noteId } });
    return this.list(entryId);
  }

  private async find(entryId: number, noteId: number) {
    const note = await this.prisma.entryNote.findUnique({ where: { id: noteId } });
    if (!note || note.entryId !== entryId) throw new NotFoundException('Note not found');
    return note;
  }
}
