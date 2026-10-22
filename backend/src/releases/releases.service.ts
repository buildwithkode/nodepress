import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PluginHookBus } from '../plugin/plugin-hook-bus';
import { PluginEvents } from '../plugin/plugin.events';
import { PluginVetoError } from '../plugin/plugin-veto.error';
import { AddReleaseItemsDto, CreateReleaseDto, ReleaseAction, UpdateReleaseDto } from './release.dto';

/** Releases that can still be edited or published. */
const EDITABLE = ['open', 'scheduled', 'failed'];
/** A release stuck in `publishing` this long (crashed instance) is marked failed. */
const STUCK_MS = 10 * 60_000;

const STATUS_FOR: Record<ReleaseAction, string> = {
  publish: 'published',
  unpublish: 'draft',
  archive: 'archived',
};

/**
 * Content releases: a named set of entry changes — publish, unpublish or
 * archive — applied in one database transaction, now or at `scheduledAt`.
 *
 * Each item uses the entry as it is when the release goes out (no snapshot),
 * so editors keep editing drafts until then. The scheduler claims a due
 * release with a conditional update, so exactly one instance publishes it.
 */
@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    @Optional() private readonly hookBus?: PluginHookBus,
  ) {}

  async findAll() {
    const releases = await this.prisma.release.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: { _count: { select: { items: true } } },
    });
    return releases.map(({ _count, ...r }) => ({ ...r, itemCount: _count.items }));
  }

  async findOne(id: number) {
    const release = await this.prisma.release.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            entry: {
              select: {
                id: true, slug: true, locale: true, status: true, deletedAt: true, data: true, updatedAt: true,
                contentType: { select: { id: true, name: true, displayName: true } },
              },
            },
          },
        },
      },
    });
    if (!release) throw new NotFoundException(`Release #${id} not found`);

    // Other unpublished releases touching the same entries — the later one wins.
    const entryIds = release.items.map((i) => i.entryId);
    const others = entryIds.length
      ? await this.prisma.releaseItem.findMany({
          where: { entryId: { in: entryIds }, releaseId: { not: id }, release: { status: { in: EDITABLE } } },
          select: { entryId: true, action: true, release: { select: { id: true, name: true, scheduledAt: true } } },
        })
      : [];
    return {
      ...release,
      items: release.items.map((item) => ({
        ...item,
        conflicts: others.filter((o) => o.entryId === item.entryId).map((o) => ({ ...o.release, action: o.action })),
      })),
    };
  }

  create(dto: CreateReleaseDto, actorId?: number) {
    return this.prisma.release.create({
      data: { name: dto.name.trim(), description: dto.description?.trim() || null, createdBy: actorId ?? null },
    });
  }

  async update(id: number, dto: UpdateReleaseDto) {
    await this.editable(id);
    return this.prisma.release.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      },
    });
  }

  async remove(id: number) {
    const release = await this.get(id);
    if (release.status === 'publishing') throw new ConflictException('The release is being published');
    await this.prisma.release.delete({ where: { id } });
    return { message: `Release #${id} deleted` };
  }

  async addItems(id: number, dto: AddReleaseItemsDto) {
    await this.editable(id);
    const ids = [...new Set(dto.entryIds)];
    const found = await this.prisma.entry.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    if (found.length !== ids.length) {
      const missing = ids.filter((e) => !found.some((f) => f.id === e));
      throw new BadRequestException(`Entries not found: ${missing.join(', ')}`);
    }
    const action = dto.action ?? 'publish';
    await this.prisma.$transaction(
      ids.map((entryId) =>
        this.prisma.releaseItem.upsert({
          where: { releaseId_entryId: { releaseId: id, entryId } },
          create: { releaseId: id, entryId, action },
          update: { action },
        }),
      ),
    );
    return this.findOne(id);
  }

  async removeItem(id: number, itemId: number) {
    await this.editable(id);
    const { count } = await this.prisma.releaseItem.deleteMany({ where: { id: itemId, releaseId: id } });
    if (count === 0) throw new NotFoundException(`Item #${itemId} is not in release #${id}`);
    return this.findOne(id);
  }

  async schedule(id: number, scheduledAt: string | null) {
    await this.editable(id);
    if (scheduledAt === null) {
      return this.prisma.release.update({ where: { id }, data: { status: 'open', scheduledAt: null } });
    }
    const at = new Date(scheduledAt);
    if (at.getTime() <= Date.now()) throw new BadRequestException('scheduledAt must be in the future');
    return this.prisma.release.update({ where: { id }, data: { status: 'scheduled', scheduledAt: at, error: null } });
  }

  /** Publish now. Throws if another publish is running or the release is done. */
  async publish(id: number) {
    await this.get(id);
    const { count } = await this.prisma.release.updateMany({
      where: { id, status: { in: EDITABLE } },
      data: { status: 'publishing' },
    });
    if (count === 0) throw new ConflictException('The release has already been published or is being published');
    await this.run(id);
    return this.findOne(id);
  }

  /** Every minute on every instance: publish due releases; fail ones a crash left behind. */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishDueReleases() {
    await this.prisma.release.updateMany({
      where: { status: 'publishing', updatedAt: { lt: new Date(Date.now() - STUCK_MS) } },
      data: { status: 'failed', error: 'Publishing was interrupted — publish it again' },
    });
    const due = await this.prisma.release.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    for (const { id } of due) {
      const { count } = await this.prisma.release.updateMany({
        where: { id, status: 'scheduled', scheduledAt: { lte: new Date() } },
        data: { status: 'publishing' },
      });
      if (count === 0) continue; // another instance claimed it
      await this.run(id).catch(() => {}); // run() records the failure on the release
    }
  }

  /** Apply a claimed (`publishing`) release. On failure it ends `failed` with the reason. */
  private async run(id: number) {
    try {
      const items = await this.prisma.releaseItem.findMany({
        where: { releaseId: id },
        include: { entry: { include: { contentType: true } } },
      });
      const live = items.filter((i) => i.entry && i.entry.deletedAt === null);
      const byAction = new Map<ReleaseAction, typeof live>();
      for (const item of live) {
        const action = item.action as ReleaseAction;
        if (!STATUS_FOR[action]) continue;
        byAction.set(action, [...(byAction.get(action) ?? []), item]);
      }

      // Plugins may veto publishing; nothing has changed yet, so the whole release stops.
      const publishing = (byAction.get('publish') ?? []).filter((i) => i.entry.status !== 'published');
      for (const item of publishing) {
        await this.hookBus?.emit(PluginEvents.ENTRY_BEFORE_PUBLISH, this.payload(item.entry, item.entry.status));
      }

      const now = new Date();
      await this.prisma.$transaction([
        ...[...byAction].map(([action, group]) =>
          this.prisma.entry.updateMany({
            where: { id: { in: group.map((i) => i.entryId) }, deletedAt: null },
            data: action === 'publish' ? { status: 'published', publishAt: null } : { status: STATUS_FOR[action] },
          }),
        ),
        this.prisma.release.update({ where: { id }, data: { status: 'published', publishedAt: now, error: null } }),
      ]);

      const changed = live.filter((i) => i.entry.status !== STATUS_FOR[i.action as ReleaseAction]);
      for (const item of changed) {
        const status = STATUS_FOR[item.action as ReleaseAction];
        this.webhooks.fire(status === 'published' ? 'entry.published' : 'entry.updated', {
          id: item.entry.id, slug: item.entry.slug, status, release: id,
        });
        await this.hookBus?.emit(PluginEvents.ENTRY_AFTER_UPDATE, this.payload(item.entry, status));
        if (status === 'published') await this.hookBus?.emit(PluginEvents.ENTRY_AFTER_PUBLISH, this.payload(item.entry, status));
      }
      this.webhooks.fire('release.published', {
        id, entries: changed.length, skipped: items.length - live.length,
      });
      this.logger.log(`Release #${id} published: ${changed.length} entr${changed.length === 1 ? 'y' : 'ies'} changed`);
    } catch (err: any) {
      const message = err instanceof PluginVetoError ? `Blocked by a plugin: ${err.message}` : err?.message ?? String(err);
      await this.prisma.release.update({ where: { id }, data: { status: 'failed', error: message } }).catch(() => {});
      this.logger.error(`Release #${id} failed: ${message}`);
      throw new UnprocessableEntityException(message);
    }
  }

  private payload(entry: any, status: string) {
    return {
      id: entry.id, slug: entry.slug, status, contentType: entry.contentType?.name ?? '',
      locale: entry.locale, data: entry.data as Record<string, any>, source: 'release' as const,
    };
  }

  private async get(id: number) {
    const release = await this.prisma.release.findUnique({ where: { id } });
    if (!release) throw new NotFoundException(`Release #${id} not found`);
    return release;
  }

  private async editable(id: number) {
    const release = await this.get(id);
    if (!EDITABLE.includes(release.status)) {
      throw new ConflictException(`A ${release.status} release can't be changed`);
    }
    return release;
  }
}
