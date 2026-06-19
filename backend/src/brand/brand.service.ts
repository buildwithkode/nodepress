import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** The brand is a singleton — always stored in row id=1. */
const SINGLETON_ID = 1;

export interface Brand {
  brandName: string;
  brandLogoUrl: string | null;
  brandColor: string;
}

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  /** Return the brand, creating it with schema defaults on first access. */
  async get() {
    const existing = await this.prisma.setting.findUnique({ where: { id: SINGLETON_ID } });
    return existing ?? this.prisma.setting.create({ data: { id: SINGLETON_ID } });
  }

  async update(data: { brandName?: string; brandLogoUrl?: string | null; brandColor?: string }) {
    // An empty logo string means "clear the logo" → store null.
    const patch = { ...data };
    if (patch.brandLogoUrl === '') patch.brandLogoUrl = null;

    return this.prisma.setting.upsert({
      where:  { id: SINGLETON_ID },
      update: patch,
      create: { id: SINGLETON_ID, ...patch },
    });
  }
}
