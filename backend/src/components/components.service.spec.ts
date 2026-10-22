import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ComponentsService, componentOf } from './components.service';
import { SchemaValidator } from '../fields/schema.validator';

const seoFields = [
  { name: 'meta_title', type: 'text', required: true },
  { name: 'meta_description', type: 'textarea' },
];

const mockPrisma = {
  component: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contentType: { findMany: jest.fn() },
};
const mockContentTypes = { update: jest.fn() };
const mockModuleRef = { get: jest.fn(() => mockContentTypes) };

describe('ComponentsService', () => {
  let service: ComponentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contentType.findMany.mockResolvedValue([]);
    service = new ComponentsService(mockPrisma as any, new SchemaValidator(), mockModuleRef as any);
  });

  describe('componentOf', () => {
    it('reads options.component on group and repeater fields only', () => {
      expect(componentOf({ type: 'group', options: { component: 'SEO' } })).toBe('seo');
      expect(componentOf({ type: 'repeater', options: { component: 'link' } })).toBe('link');
      expect(componentOf({ type: 'flexible', options: { component: 'seo' } })).toBeNull();
      expect(componentOf({ type: 'group', options: { subFields: [] } })).toBeNull();
    });
  });

  describe('validateFields', () => {
    it('accepts simple fields and normalizes their names', () => {
      expect(service.validateFields([{ name: 'Meta Title', type: 'text' }])).toEqual([{ name: 'meta_title', type: 'text' }]);
    });

    it('rejects nested complex fields with paths relative to the component', () => {
      try {
        service.validateFields([{ name: 'items', type: 'repeater', options: { subFields: [{ name: 'a', type: 'text' }] } }]);
        fail('expected a BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.response.errors[0]).toMatch(/^fields\[0\]\.type: nested/);
      }
    });

    it('rejects reverse relations, empty lists and duplicates', () => {
      expect(() => service.validateFields([
        { name: 'posts', type: 'relation', options: { relatedContentType: 'post', mappedBy: 'author' } },
      ])).toThrow(BadRequestException);
      expect(() => service.validateFields([])).toThrow(BadRequestException);
      expect(() => service.validateFields([{ name: 'a', type: 'text' }, { name: 'a', type: 'text' }])).toThrow(BadRequestException);
      expect(() => service.validateFields('nope')).toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('normalizes the name and stores validated fields', async () => {
      mockPrisma.component.findUnique.mockResolvedValue(null);
      mockPrisma.component.create.mockImplementation(({ data }) => ({ id: 1, ...data }));
      const c = await service.create({ name: 'Page SEO', fields: seoFields as any });
      expect(c.name).toBe('page_seo');
      expect(mockPrisma.component.create.mock.calls[0][0].data.fields).toEqual(seoFields);
    });

    it('409 on a duplicate name', async () => {
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.create({ name: 'seo', fields: seoFields as any })).rejects.toThrow(ConflictException);
    });
  });

  describe('expand', () => {
    it('replaces subFields of group and repeater fields with the component fields', async () => {
      mockPrisma.component.findMany.mockResolvedValue([{ name: 'seo', fields: seoFields }]);
      const schema = [
        { name: 'title', type: 'text' },
        { name: 'seo', type: 'group', options: { component: 'seo', subFields: [{ name: 'stale', type: 'text' }] } },
        { name: 'seos', type: 'repeater', options: { component: 'SEO', maxItems: 3 } },
      ];
      const out: any[] = await service.expand(schema);
      expect(out[0]).toBe(schema[0]);
      expect(out[1].options).toEqual({ component: 'seo', subFields: seoFields });
      expect(out[2].options).toEqual({ component: 'seo', maxItems: 3, subFields: seoFields });
      expect(mockPrisma.component.findMany).toHaveBeenCalledTimes(1);
      // A copy, so later edits to one schema never leak into another.
      expect(out[1].options.subFields).not.toBe(seoFields);
    });

    it('400 for an unknown component', async () => {
      mockPrisma.component.findMany.mockResolvedValue([]);
      await expect(service.expand([{ name: 'x', type: 'group', options: { component: 'nope' } }]))
        .rejects.toThrow('Unknown component: "nope"');
    });

    it('uses overrides before the database and skips the query when nothing is needed', async () => {
      const overrides = new Map([['seo', [{ name: 'only', type: 'text' }]]]);
      const out: any[] = await service.expand([{ name: 's', type: 'group', options: { component: 'seo' } }], overrides);
      expect(out[0].options.subFields).toEqual([{ name: 'only', type: 'text' }]);
      expect(mockPrisma.component.findMany).not.toHaveBeenCalled();
      expect(await service.expand([{ name: 't', type: 'text' }])).toEqual([{ name: 't', type: 'text' }]);
    });
  });

  describe('update (propagation)', () => {
    const blog = {
      id: 7, name: 'blog', displayName: null,
      schema: [
        { name: 'title', type: 'text' },
        { name: 'seo', type: 'group', options: { component: 'seo', subFields: seoFields } },
      ],
    };
    const page = { id: 8, name: 'page', displayName: null, schema: [{ name: 'title', type: 'text' }] };

    it('rewrites every content type that uses the component through ContentTypeService.update', async () => {
      const newFields = [...seoFields, { name: 'og_image', type: 'image' }];
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields });
      mockPrisma.component.update.mockResolvedValue({ id: 1, name: 'seo', fields: newFields });
      mockPrisma.contentType.findMany.mockResolvedValue([blog, page]);

      const res = await service.update(1, { fields: newFields as any }, 42);

      expect(mockContentTypes.update).toHaveBeenCalledTimes(1);
      const [id, dto, actor] = mockContentTypes.update.mock.calls[0];
      expect(id).toBe(7);
      expect(actor).toBe(42);
      expect(dto.schema[1].options.subFields).toEqual(newFields);
      expect(res.updatedContentTypes).toEqual([{ id: 7, name: 'blog' }]);
    });

    it('follows a rename and leaves unchanged schemas alone', async () => {
      mockPrisma.component.findUnique.mockResolvedValueOnce({ id: 1, name: 'seo', fields: seoFields }).mockResolvedValueOnce(null);
      mockPrisma.component.update.mockResolvedValue({ id: 1, name: 'meta', fields: seoFields });
      mockPrisma.contentType.findMany.mockResolvedValue([blog]);
      await service.update(1, { name: 'meta' });
      expect(mockContentTypes.update.mock.calls[0][1].schema[1].options.component).toBe('meta');

      jest.clearAllMocks();
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields });
      mockPrisma.component.update.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields, displayName: 'SEO' });
      const res = await service.update(1, { displayName: 'SEO' });
      expect(mockContentTypes.update).not.toHaveBeenCalled();
      expect(res.updatedContentTypes).toEqual([]);
    });

    it('reports content types that could not be updated', async () => {
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields });
      mockPrisma.component.update.mockResolvedValue({ id: 1, name: 'seo', fields: [{ name: 'x', type: 'text' }] });
      mockPrisma.contentType.findMany.mockResolvedValue([blog]);
      mockContentTypes.update.mockRejectedValueOnce(new BadRequestException('nope'));
      const res = await service.update(1, { fields: [{ name: 'x', type: 'text' }] as any });
      expect(res.propagationErrors).toEqual(['blog: nope']);
    });

    it('404 for a missing component', async () => {
      mockPrisma.component.findUnique.mockResolvedValue(null);
      await expect(service.update(9, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('409 while a content type uses it', async () => {
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields });
      mockPrisma.contentType.findMany.mockResolvedValue([
        { id: 7, name: 'blog', schema: [{ name: 'seo', type: 'group', options: { component: 'seo', subFields: seoFields } }] },
      ]);
      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(mockPrisma.component.delete).not.toHaveBeenCalled();
    });

    it('deletes an unused component', async () => {
      mockPrisma.component.findUnique.mockResolvedValue({ id: 1, name: 'seo', fields: seoFields });
      await service.remove(1);
      expect(mockPrisma.component.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('import bundle', () => {
    it('prepareImport validates and returns the fields to expand against', async () => {
      mockPrisma.component.findMany.mockResolvedValue([{ name: 'kept' }]);
      const errors: string[] = [];
      const map = await service.prepareImport([
        { name: 'seo', fields: seoFields },
        { name: 'kept', fields: seoFields },
        { name: 'bad', fields: [] },
        { fields: seoFields },
      ], errors, false);
      expect([...map.keys()]).toEqual(['seo']);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/^Component "bad"/);
    });

    it('exportComponents returns only the components the schemas use', async () => {
      mockPrisma.component.findMany.mockResolvedValue([{ name: 'seo', displayName: null, description: null, fields: seoFields }]);
      const out = await service.exportComponents([[{ name: 's', type: 'group', options: { component: 'seo' } }]]);
      expect(mockPrisma.component.findMany.mock.calls[0][0].where).toEqual({ name: { in: ['seo'] } });
      expect(out).toEqual([{ name: 'seo', displayName: null, description: null, fields: seoFields }]);
      expect(await service.exportComponents([[{ name: 't', type: 'text' }]])).toEqual([]);
    });
  });
});
