import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApiKeyDto) {
    const key = `np_${randomBytes(24).toString('hex')}`;
    return this.prisma.apiKey.create({
      data: {
        name: dto.name,
        key,
        permissions: dto.permissions as any,
      },
    });
  }

  findAll() {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        key: true,
        permissions: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  async remove(id: number) {
    await this.prisma.apiKey.findFirstOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException(`API key #${id} not found`);
    });
    return this.prisma.apiKey.delete({ where: { id } });
  }

  /** Called by the guard to validate a key and record last-used timestamp */
  async validate(key: string) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { key } });
    if (!apiKey) return null;
    // Update lastUsedAt asynchronously — don't await to keep the request fast
    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return apiKey;
  }
}
