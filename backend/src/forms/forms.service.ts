import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

@Injectable()
export class FormsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateFormDto) {
    const slug = this.normalizeSlug(dto.slug);
    this.assertSlugNotReserved(slug);

    try {
      return await this.prisma.form.create({
        data: {
          name:     dto.name,
          slug,
          fields:   (dto.fields  ?? []) as any,
          actions:  (dto.actions ?? []) as any,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`A form with slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  findAll() {
    return this.prisma.form.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    });
  }

  async findOne(id: number) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!form) throw new NotFoundException(`Form #${id} not found`);
    return form;
  }

  async update(id: number, dto: UpdateFormDto) {
    await this.findOne(id); // ensure exists

    const data: any = {};
    if (dto.name     !== undefined) data.name     = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.fields   !== undefined) data.fields   = dto.fields  as any;
    if (dto.actions  !== undefined) data.actions  = dto.actions as any;
    if (dto.slug     !== undefined) {
      data.slug = this.normalizeSlug(dto.slug);
      this.assertSlugNotReserved(data.slug);
    }

    try {
      return await this.prisma.form.update({ where: { id }, data });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`Slug "${data.slug}" is already taken`);
      }
      throw err;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.form.delete({ where: { id } });
  }

  // ── Submission helpers ────────────────────────────────────────────────────

  async findBySlug(slug: string) {
    const form = await this.prisma.form.findUnique({ where: { slug } });
    if (!form)           throw new NotFoundException(`Form "${slug}" not found`);
    if (!form.isActive)  throw new BadRequestException(`Form "${slug}" is not accepting submissions`);
    return form;
  }

  findSubmissions(formId: number) {
    return this.prisma.formSubmission.findMany({
      where:   { formId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Recent submissions across all forms — used by the dashboard */
  findRecentSubmissions(limit = 6) {
    return this.prisma.formSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: { form: { select: { id: true, name: true, slug: true } } },
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private normalizeSlug(raw: string): string {
    return raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private assertSlugNotReserved(slug: string) {
    const RESERVED = ['submit', 'forms', 'api', 'auth', 'media', 'entries'];
    if (RESERVED.includes(slug)) {
      throw new BadRequestException(`"${slug}" is a reserved slug`);
    }
  }
}
