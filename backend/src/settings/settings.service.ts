import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingItemDto } from './dto/upsert-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.siteSetting.findMany({
      orderBy: [{ group: 'asc' }, { sort: 'asc' }, { key: 'asc' }],
    });
  }

  /** Returns a flat { key: value } map — used by the public endpoint */
  async findPublic(): Promise<Record<string, string>> {
    const settings = await this.prisma.siteSetting.findMany({
      select: { key: true, value: true },
    });
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }

  /** Bulk upsert — creates or updates each setting by key */
  async upsertMany(items: SettingItemDto[]) {
    await Promise.all(
      items.map((item) =>
        this.prisma.siteSetting.upsert({
          where:  { key: item.key },
          create: {
            key:   item.key,
            value: item.value,
            label: item.label ?? item.key,
            type:  item.type  ?? 'text',
            group: item.group ?? 'General',
            sort:  item.sort  ?? 0,
          },
          update: {
            value: item.value,
            label: item.label !== undefined ? item.label : undefined,
            type:  item.type  !== undefined ? item.type  : undefined,
            group: item.group !== undefined ? item.group : undefined,
            sort:  item.sort  !== undefined ? item.sort  : undefined,
          },
        }),
      ),
    );
    return this.findAll();
  }

  async remove(key: string) {
    const setting = await this.prisma.siteSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return this.prisma.siteSetting.delete({ where: { key } });
  }
}
