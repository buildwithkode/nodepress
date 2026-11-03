import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { isReservedFormSlug, normalizeFormSlug } from './form-slug';
import { FORMS_FILE_FORMAT, FORMS_FILE_VERSION, planForms, SiteFormWrite } from './form-import';

@Injectable()
export class FormsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateFormDto) {
    const slug = this.normalizeSlug(dto.slug);
    this.assertSlugNotReserved(slug);

    try {
      return await this.prisma.form.create({
        data: {
          name:           dto.name,
          slug,
          fields:         (dto.fields  ?? []) as Prisma.InputJsonValue,
          actions:        (dto.actions ?? []) as Prisma.InputJsonValue,
          isActive:       dto.isActive       ?? true,
          captchaEnabled: dto.captchaEnabled ?? false,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`A form with slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.form.count(),
      this.prisma.form.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { submissions: true } } },
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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

    const data: Prisma.FormUpdateInput = {};
    if (dto.name           !== undefined) data.name           = dto.name;
    if (dto.isActive       !== undefined) data.isActive       = dto.isActive;
    if (dto.captchaEnabled !== undefined) data.captchaEnabled = dto.captchaEnabled;
    if (dto.fields         !== undefined) data.fields         = dto.fields  as Prisma.InputJsonValue;
    if (dto.actions        !== undefined) data.actions        = dto.actions as Prisma.InputJsonValue;
    if (dto.slug           !== undefined) {
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

  // ── Export / import ───────────────────────────────────────────────────────

  /** Every form's settings, without ids or submissions. Also part of the site export. */
  exportRows() {
    return this.prisma.form.findMany({
      orderBy: { slug: 'asc' },
      select: { name: true, slug: true, fields: true, actions: true, isActive: true, captchaEnabled: true },
    });
  }

  async exportFile() {
    return {
      format: FORMS_FILE_FORMAT,
      version: FORMS_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      forms: await this.exportRows(),
    };
  }

  /** Import a forms export. All or nothing on problems in the file; a dry run only reports. */
  async importFile(file: any, opts: { dryRun?: boolean; overwrite?: boolean } = {}) {
    if (!file || typeof file !== 'object' || file.format !== FORMS_FILE_FORMAT) {
      throw new BadRequestException(`Not a NodePress forms export (expected "format": "${FORMS_FILE_FORMAT}")`);
    }
    if (typeof file.version !== 'number' || file.version > FORMS_FILE_VERSION) {
      throw new BadRequestException(`This forms export uses format version ${file.version}; this NodePress reads up to ${FORMS_FILE_VERSION}`);
    }
    const existing = await this.prisma.form.findMany({ select: { slug: true } });
    const plan = planForms(file.forms, new Set(existing.map((f) => f.slug)), opts.overwrite !== false);
    const { total, toCreate, toUpdate, toSkip, errors } = plan;
    if (opts.dryRun) return { dryRun: true, valid: errors.length === 0, errors, total, toCreate, toUpdate, toSkip };
    if (errors.length) throw new BadRequestException({ message: 'Import aborted — nothing was changed', errors });
    return { ...(await this.writeImported(plan.creates, plan.updates)), skipped: toSkip };
  }

  /** Updates in place, so a form keeps its id and its submissions. Returns what failed. */
  async writeImported(creates: SiteFormWrite[], updates: SiteFormWrite[]) {
    const counts = { created: 0, updated: 0 };
    const errors: string[] = [];
    const write = async (form: SiteFormWrite, isNew: boolean) => {
      const { slug, ...values } = form;
      const data = { ...values, fields: values.fields as Prisma.InputJsonValue, actions: values.actions as Prisma.InputJsonValue };
      try {
        if (isNew) await this.prisma.form.create({ data: { slug, ...data } });
        else await this.prisma.form.update({ where: { slug }, data });
        counts[isNew ? 'created' : 'updated']++;
      } catch (err: any) {
        errors.push(`Form "${slug}": ${err.message}`);
      }
    };
    for (const form of creates) await write(form, true);
    for (const form of updates) await write(form, false);
    return { ...counts, errors };
  }

  // ── Submission helpers ────────────────────────────────────────────────────

  async findBySlug(slug: string) {
    const form = await this.prisma.form.findUnique({ where: { slug } });
    if (!form)           throw new NotFoundException(`Form "${slug}" not found`);
    if (!form.isActive)  throw new BadRequestException(`Form "${slug}" is not accepting submissions`);
    return form;
  }

  async findSubmissions(formId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.formSubmission.count({ where: { formId } }),
      this.prisma.formSubmission.findMany({
        where:   { formId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
    return normalizeFormSlug(raw);
  }

  private assertSlugNotReserved(slug: string) {
    if (isReservedFormSlug(slug)) {
      throw new BadRequestException(`"${slug}" is a reserved slug`);
    }
  }
}
