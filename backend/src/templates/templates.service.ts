import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentTypeService } from '../content-type/content-type.service';
import { EntriesService } from '../entries/entries.service';
import { STARTER_TEMPLATES, StarterTemplate } from './starter-templates';

const REF = /^@([a-z0-9_]+)\/([a-z0-9-]+)$/;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentTypes: ContentTypeService,
    private readonly entries: EntriesService,
  ) {}

  list() {
    return STARTER_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      contentTypes: t.contentTypes.map((c) => ({ name: c.name, displayName: c.displayName, fields: c.schema.length })),
      entries: t.entries.length,
    }));
  }

  /**
   * Create the template's content types and sample entries (published).
   * Refuses up front if any of its content type names is taken, so a template
   * is never half-applied over existing content.
   */
  async apply(id: string, actorId?: number, options: { sampleContent?: boolean } = {}) {
    const template = this.get(id);
    const names = template.contentTypes.map((c) => c.name);
    const taken = await this.prisma.contentType.findMany({ where: { name: { in: names } }, select: { name: true } });
    if (taken.length) {
      throw new ConflictException(`These content types already exist: ${taken.map((t) => t.name).join(', ')}`);
    }

    const created = new Map<string, { id: number; schema: any[] }>();
    for (const ct of template.contentTypes) {
      const row = await this.contentTypes.create({ name: ct.name, displayName: ct.displayName, schema: ct.schema } as any);
      created.set(ct.name, { id: row.id, schema: ct.schema });
    }
    for (const { type, field } of template.reverseFields ?? []) {
      const ct = created.get(type)!;
      ct.schema = [...ct.schema, field];
      await this.contentTypes.update(ct.id, { schema: ct.schema } as any, actorId);
    }

    let entryCount = 0;
    if (options.sampleContent !== false) {
      const publicIds = new Map<string, string>();
      const resolve = (v: any): any => {
        if (Array.isArray(v)) return v.map(resolve);
        if (typeof v === 'string') {
          const m = REF.exec(v);
          if (m) return publicIds.get(`${m[1]}/${m[2]}`) ?? null;
        }
        return v;
      };
      for (const e of template.entries) {
        const data = Object.fromEntries(Object.entries(e.data).map(([k, v]) => [k, resolve(v)]));
        const entry: any = await this.entries.create(
          { contentTypeId: created.get(e.type)!.id, slug: e.slug, status: 'published', data } as any,
          actorId,
          'admin',
        );
        publicIds.set(`${e.type}/${e.slug}`, entry.publicId);
        entryCount++;
      }
    }

    return {
      template: template.id,
      contentTypes: [...created].map(([name, { id }]) => ({ id, name })),
      entries: entryCount,
    };
  }

  private get(id: string): StarterTemplate {
    const template = STARTER_TEMPLATES.find((t) => t.id === id);
    if (!template) throw new NotFoundException(`No template "${id}"`);
    return template;
  }
}
