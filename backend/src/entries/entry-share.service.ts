import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from '../auth/token-hash';
import { filterUnauthorizedReadFields } from '../common/field-security.util';
import { publicReadFields } from '../openapi/openapi.builder';
import { FieldDef } from '../fields/field.types';
import { EntriesService } from './entries.service';

/** How long a share link may last, in days. */
export const SHARE_LINK_DAYS = [1, 7, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = 'nps_';

/** Looks like a share token (so junk never reaches the database). */
export function isShareToken(v: unknown): v is string {
  return typeof v === 'string' && /^nps_[0-9a-f]{48}$/.test(v);
}

/**
 * Share links: one entry, published or not, shown to someone without an admin
 * login until the link expires or is revoked. The token is shown once; only its
 * hash is stored (like API keys). What the link shows is what the public API
 * would show of that entry: fields hidden from the public stay hidden.
 */
@Injectable()
export class EntryShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  async create(entryId: number, userId: number, days: number) {
    if (!(SHARE_LINK_DAYS as readonly number[]).includes(days)) {
      throw new BadRequestException(`days must be one of: ${SHARE_LINK_DAYS.join(', ')}`);
    }
    const entry = await this.prisma.entry.findFirst({ where: { id: entryId, deletedAt: null }, select: { id: true } });
    if (!entry) throw new NotFoundException(`Entry #${entryId} not found`);
    const token = TOKEN_PREFIX + randomBytes(24).toString('hex');
    const link = await this.prisma.entryShareLink.create({
      data: { entryId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + days * DAY_MS), createdBy: userId },
    });
    return { id: link.id, token, expiresAt: link.expiresAt, createdAt: link.createdAt };
  }

  /** Links that still work, newest first (without tokens: those were shown once). */
  async list(entryId: number) {
    const links = await this.prisma.entryShareLink.findMany({
      where: { entryId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = [...new Set(links.map((l) => l.createdBy).filter((n): n is number => n != null))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    return links.map((l) => {
      const u = users.find((x) => x.id === l.createdBy);
      return {
        id: l.id,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
        createdBy: u ? u.name?.trim() || u.email.split('@')[0] : null,
      };
    });
  }

  async revoke(entryId: number, linkId: number) {
    const { count } = await this.prisma.entryShareLink.deleteMany({ where: { id: linkId, entryId } });
    if (!count) throw new NotFoundException('Share link not found');
    return { revoked: true };
  }

  /** What a share link shows. 404 for unknown, expired or revoked links and trashed entries. */
  async open(token: string) {
    const gone = () => new NotFoundException('This link has expired or was removed');
    if (!isShareToken(token)) throw gone();
    const link = await this.prisma.entryShareLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { entry: { include: { contentType: true } } },
    });
    if (!link || link.expiresAt <= new Date() || !link.entry || link.entry.deletedAt) throw gone();

    const { entry } = link;
    const ct = entry.contentType;
    const schema = Array.isArray(ct.schema) ? (ct.schema as unknown as FieldDef[]) : [];
    // The site's own preview gets a short-lived preview token for this entry only
    const preview = ct.previewUrl ? await this.entries.generatePreviewToken(entry.id) : null;
    return {
      expiresAt: link.expiresAt,
      entry: {
        id: entry.publicId,
        slug: entry.slug,
        locale: entry.locale,
        status: entry.status,
        data: filterUnauthorizedReadFields(entry.data as Record<string, any>, schema, undefined),
        seo: entry.seo,
        updatedAt: entry.updatedAt,
      },
      contentType: {
        name: ct.name,
        displayName: ct.displayName,
        schema: publicReadFields(schema),
        previewUrl: ct.previewUrl ?? null,
      },
      previewToken: preview?.token ?? null,
    };
  }
}
