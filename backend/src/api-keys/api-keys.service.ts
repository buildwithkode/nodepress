import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { randomBytes } from 'crypto';

/** Cache valid keys for 5 minutes, invalid key lookups for 30 seconds */
const VALID_KEY_TTL   = 5 * 60_000;
const INVALID_KEY_TTL = 30_000;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

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
    const apiKey = await this.prisma.apiKey.findFirst({ where: { id } });
    if (!apiKey) throw new NotFoundException(`API key #${id} not found`);

    // Invalidate the cache entry so the key stops working immediately
    await this.cache.invalidatePrefix(`apikey:${apiKey.key}`);

    return this.prisma.apiKey.delete({ where: { id } });
  }

  /** Called by the guard to validate a key and record last-used timestamp.
   *  Results are cached for 5 minutes to avoid a DB hit on every request. */
  async validate(key: string) {
    const cacheKey = `apikey:${key}`;

    const cached = await this.cache.get<any>(cacheKey);
    // Cache hit — null means previously looked up and not found (negative cache)
    if (cached !== undefined) return cached as typeof apiKey | null;

    const apiKey = await this.prisma.apiKey.findUnique({ where: { key } });

    if (!apiKey) {
      // Cache negative result briefly to prevent DB hammering with invalid keys
      await this.cache.set(cacheKey, null, INVALID_KEY_TTL);
      return null;
    }

    await this.cache.set(cacheKey, apiKey, VALID_KEY_TTL);

    // Update lastUsedAt asynchronously — don't await to keep the request fast
    this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    return apiKey;
  }
}
