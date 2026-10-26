import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChoiceListsService } from './choice-lists.service';
import {
  applyChoices, choiceListOf, removedValuesQuery, selectsUsing, validateChoices,
} from './choice-list.util';
import { SchemaValidator } from '../fields/schema.validator';

const gender = { id: 1, name: 'gender', label: 'Gender', description: null, choices: [
  { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other' },
] };

const mockPrisma = {
  choiceList: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contentType: { findMany: jest.fn() },
  component: { findMany: jest.fn(), update: jest.fn() },
  $queryRawUnsafe: jest.fn(),
  onOperation: jest.fn(),
};
const mockCache = { invalidatePrefix: jest.fn(), getMany: jest.fn(), set: jest.fn() };
const mockContentTypes = { update: jest.fn() };
const mockModuleRef = { get: jest.fn(() => mockContentTypes) };

/** A schema with the list at every nesting level. */
const nested: any[] = [
  { name: 'gender', type: 'select', options: { choiceList: 'Gender' } },
  { name: 'kids', type: 'repeater', options: { subFields: [{ name: 'gender', type: 'select', options: { choiceList: 'gender', choices: ['x'] } }] } },
  { name: 'contact', type: 'group', options: { subFields: [{ name: 'gender', type: 'select', options: { choiceList: 'gender', multiple: true } }] } },
  { name: 'blocks', type: 'flexible', options: { layouts: [{ name: 'person', fields: [{ name: 'gender', type: 'select', options: { choiceList: 'gender' } }] }] } },
  { name: 'size', type: 'select', options: { choices: ['s', 'm'] } },
];

describe('choice-list.util', () => {
  it('validates choices: shorthand strings, trimmed values, labels equal to the value dropped', () => {
    expect(validateChoices(['a', { value: ' b ', label: 'B' }, { value: 'c', label: 'c' }, { value: 'd', label: '' }]))
      .toEqual([{ value: 'a' }, { value: 'b', label: 'B' }, { value: 'c' }, { value: 'd' }]);
  });

  it('rejects empty lists, duplicates, empty and over-long values, too many choices', () => {
    expect(() => validateChoices([])).toThrow(BadRequestException);
    expect(() => validateChoices('a')).toThrow(BadRequestException);
    try {
      validateChoices([{ value: 'a' }, { value: 'a' }, { value: '' }, { value: 'x'.repeat(201) }, { value: 'b', label: 3 }]);
      fail('expected a BadRequestException');
    } catch (err: any) {
      expect(err.response.errors).toEqual([
        'choices[1].value "a": duplicate value',
        'choices[2].value: must be a non-empty string',
        'choices[3].value: must be at most 200 characters',
        'choices[4].label: must be a string',
      ]);
    }
    expect(() => validateChoices(Array.from({ length: 1001 }, (_, i) => `v${i}`))).toThrow(/at most 1000/);
  });

  it('choiceListOf reads select fields only', () => {
    expect(choiceListOf({ type: 'select', options: { choiceList: 'Country Codes' } })).toBe('country_codes');
    expect(choiceListOf({ type: 'text', options: { choiceList: 'x' } })).toBeNull();
    expect(choiceListOf({ type: 'select', options: { choices: ['a'] } })).toBeNull();
  });

  it('applyChoices copies values and only the labels that differ', () => {
    const f = applyChoices({ name: 'g', type: 'select', options: { choiceList: 'gender', multiple: true, choiceLabels: { old: 'Old' } } }, 'gender', gender.choices);
    expect(f.options).toEqual({
      choiceList: 'gender', multiple: true,
      choices: ['female', 'male', 'other'],
      choiceLabels: { female: 'Female', male: 'Male' },
    });
    expect(applyChoices({ type: 'select', options: {} }, 'x', [{ value: 'a' }]).options).toEqual({ choiceList: 'x', choices: ['a'] });
  });

  it('finds select fields at every nesting level', () => {
    expect(selectsUsing(nested, 'gender').map((u) => u.path)).toEqual([
      'gender', 'kids.gender', 'contact.gender', 'blocks[person].gender',
    ]);
    expect(selectsUsing(nested, 'other')).toEqual([]);
  });

  it('builds one count query per path shape', () => {
    const [top, rep, group, flex] = selectsUsing(nested, 'gender');
    expect(removedValuesQuery(top)).toContain(`jsonb_typeof("data" -> 'gender')`);
    expect(removedValuesQuery(rep)).toContain(`jsonb_typeof("data" -> 'kids') = 'array'`);
    expect(removedValuesQuery(group)).toContain(`"data" -> 'contact' -> 'gender'`);
    expect(removedValuesQuery(flex)).toContain(`it1.item ->> '_layout' = 'person'`);
    expect(removedValuesQuery({ path: 'x', field: "x'; drop" })).toBeNull();
  });

  it('SchemaValidator accepts a select with only a choiceList, checks choiceLabels', () => {
    const v = new SchemaValidator();
    expect(() => v.validate([{ name: 'g', type: 'select', options: { choiceList: 'gender' } }])).not.toThrow();
    expect(() => v.validate([{ name: 'g', type: 'select', options: { choiceList: '' } }])).toThrow(BadRequestException);
    expect(() => v.validate([{ name: 'g', type: 'select', options: { choices: ['a'], choiceLabels: { a: 1 } } }])).toThrow(BadRequestException);
    expect(() => v.validate([{ name: 'g', type: 'select', options: { choices: ['a'], choiceLabels: { a: 'A' } } }])).not.toThrow();
  });
});

describe('ChoiceListsService', () => {
  let service: ChoiceListsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contentType.findMany.mockResolvedValue([]);
    mockPrisma.component.findMany.mockResolvedValue([]);
    service = new ChoiceListsService(mockPrisma as any, mockCache as any, mockModuleRef as any);
  });

  describe('expand', () => {
    it('copies the list in at the top level, in repeaters, groups and layouts', async () => {
      mockPrisma.choiceList.findMany.mockResolvedValue([gender]);
      const out: any[] = await service.expand(nested);
      for (const u of selectsUsing(out, 'gender')) {
        const f = u.container
          ? u.container.type === 'flexible'
            ? out[3].options.layouts[0].fields[0]
            : out.find((x: any) => x.name === u.container!.name).options.subFields[0]
          : out[0];
        expect(f.options.choices).toEqual(['female', 'male', 'other']);
        expect(f.options.choiceLabels).toEqual({ female: 'Female', male: 'Male' });
        expect(f.options.choiceList).toBe('gender');
      }
      expect(out[2].options.subFields[0].options.multiple).toBe(true);
      expect(out[4]).toBe(nested[4]); // untouched
      expect(mockPrisma.choiceList.findMany).toHaveBeenCalledWith({ where: { name: { in: ['gender'] } } });
    });

    it('400s on an unknown list and prefers bundle overrides', async () => {
      mockPrisma.choiceList.findMany.mockResolvedValue([]);
      await expect(service.expand(nested)).rejects.toThrow('Unknown choice list: "gender"');
      const out = await service.expand(nested, new Map([['gender', [{ value: 'f' }]]]));
      expect(out[0].options.choices).toEqual(['f']);
      expect(mockPrisma.choiceList.findMany).toHaveBeenCalledTimes(1);
    });

    it('leaves schemas without lists alone (no query)', async () => {
      const schema = [{ name: 'size', type: 'select', options: { choices: ['s'] } }];
      expect(await service.expand(schema)).toBe(schema);
      expect(mockPrisma.choiceList.findMany).not.toHaveBeenCalled();
    });

    it('expands component fields as they are written (operation hook)', async () => {
      service.onModuleInit();
      const hook = mockPrisma.onOperation.mock.calls[0][0];
      mockPrisma.choiceList.findMany.mockResolvedValue([gender]);
      const next = jest.fn(async (p) => p);
      const out = await hook({ model: 'Component', action: 'create', args: { data: { name: 'p', fields: [nested[0]] } } }, next);
      expect(out.args.data.fields[0].options.choices).toEqual(['female', 'male', 'other']);
      const other = { model: 'Entry', action: 'create', args: { data: {} } };
      await hook(other, next);
      expect(next).toHaveBeenLastCalledWith(other);
    });
  });

  describe('create', () => {
    it('normalizes the name, validates label and choices, 409 on duplicates', async () => {
      mockPrisma.choiceList.findUnique.mockResolvedValueOnce(null);
      mockPrisma.choiceList.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
      const out = await service.create({ name: 'Shirt Size', label: ' Size ', choices: ['s', 'm'] });
      expect(out).toMatchObject({ name: 'shirt_size', label: 'Size', choices: [{ value: 's' }, { value: 'm' }] });
      expect(mockCache.invalidatePrefix).toHaveBeenCalledWith('choice-lists:public:');

      await expect(service.create({ name: 'x', label: ' ', choices: ['a'] })).rejects.toThrow('label is required');
      await expect(service.create({ name: '1x', label: 'X', choices: ['a'] })).rejects.toThrow(BadRequestException);
      mockPrisma.choiceList.findUnique.mockResolvedValueOnce(gender);
      await expect(service.create({ name: 'gender', label: 'G', choices: ['a'] })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    const people = { id: 7, name: 'person', displayName: null, schema: [
      { name: 'gender', type: 'select', options: { choiceList: 'gender', choices: ['female', 'male', 'other'] } },
      { name: 'kids', type: 'repeater', options: { subFields: [{ name: 'gender', type: 'select', options: { choiceList: 'gender', choices: ['female', 'male', 'other'] } }] } },
    ] };
    const unrelated = { id: 8, name: 'post', displayName: null, schema: [{ name: 'title', type: 'text' }] };

    it('propagates to content types and components, and counts entries holding removed values', async () => {
      mockPrisma.choiceList.findUnique.mockResolvedValueOnce(gender);
      const next = { ...gender, choices: [{ value: 'female', label: 'Woman' }, { value: 'male', label: 'Male' }, { value: 'nonbinary' }] };
      mockPrisma.choiceList.update.mockResolvedValue(next);
      mockPrisma.contentType.findMany.mockResolvedValue([people, unrelated]);
      mockPrisma.component.findMany.mockResolvedValue([
        { id: 3, name: 'profile', fields: [{ name: 'g', type: 'select', options: { choiceList: 'gender', choices: ['female'] } }] },
        { id: 4, name: 'seo', fields: [{ name: 't', type: 'text' }] },
      ]);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ n: 2 }]).mockResolvedValueOnce([{ n: 0 }]);

      const out = await service.update(1, { choices: next.choices }, 9);

      expect(out.removedValues).toEqual(['other']);
      expect(out.removedValuesInUse).toEqual([{ contentTypeId: 7, contentType: 'person', field: 'gender', entries: 2 }]);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([7, ['other']]);
      expect(mockPrisma.$queryRawUnsafe.mock.calls[1][0]).toContain(`"data" -> 'kids'`);

      expect(out.updatedComponents).toEqual([{ id: 3, name: 'profile' }]);
      expect(out.updatedContentTypes).toEqual([{ id: 7, name: 'person' }]);
      expect(mockContentTypes.update).toHaveBeenCalledTimes(1);
      const [id, dto, actor] = mockContentTypes.update.mock.calls[0];
      expect([id, actor]).toEqual([7, 9]);
      expect(dto.schema[0].options).toEqual({ choiceList: 'gender', choices: ['female', 'male', 'nonbinary'], choiceLabels: { female: 'Woman', male: 'Male' } });
      expect(dto.schema[1].options.subFields[0].options.choices).toEqual(['female', 'male', 'nonbinary']);
    });

    it('renames the choiceList tag on a rename; no removed values → no counts', async () => {
      mockPrisma.choiceList.findUnique.mockResolvedValueOnce(gender).mockResolvedValueOnce(null);
      mockPrisma.choiceList.update.mockResolvedValue({ ...gender, name: 'sex' });
      mockPrisma.contentType.findMany.mockResolvedValue([people]);
      const out = await service.update(1, { name: 'Sex' });
      expect(out.removedValuesInUse).toBeUndefined();
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(mockContentTypes.update.mock.calls[0][1].schema[0].options.choiceList).toBe('sex');
    });

    it('skips unchanged types and collects propagation errors instead of failing the update', async () => {
      mockPrisma.choiceList.findUnique.mockResolvedValueOnce(gender);
      mockPrisma.choiceList.update.mockResolvedValue({ ...gender, choices: [{ value: 'female', label: 'F' }, { value: 'male' }, { value: 'other' }] });
      mockPrisma.contentType.findMany.mockResolvedValue([people]);
      mockContentTypes.update.mockRejectedValueOnce(new BadRequestException('nope'));
      const out = await service.update(1, { choices: [{ value: 'female', label: 'F' }, 'male', 'other'] });
      expect(out.propagationErrors).toEqual(['person: nope']);
      expect(out.updatedContentTypes).toEqual([]);
    });
  });

  describe('remove', () => {
    it('409s while a content type or component uses the list', async () => {
      mockPrisma.choiceList.findUnique.mockResolvedValue(gender);
      mockPrisma.component.findMany.mockResolvedValue([{ id: 3, name: 'profile', fields: [{ name: 'g', type: 'select', options: { choiceList: 'gender' } }] }]);
      await expect(service.remove(1)).rejects.toThrow('used by component profile');
      mockPrisma.component.findMany.mockResolvedValue([]);
      await service.remove(1);
      expect(mockPrisma.choiceList.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('public reads', () => {
    it('serves name/label/choices only, from cache when present, unknown names left out', async () => {
      mockCache.getMany.mockResolvedValue([undefined, { name: 'size', label: 'Size', choices: [{ value: 's' }] }, undefined]);
      mockPrisma.choiceList.findMany.mockResolvedValue([gender]);
      const out = await service.publicMany(['Gender', 'size', 'nope']);
      expect(out).toEqual([
        { name: 'gender', label: 'Gender', choices: gender.choices },
        { name: 'size', label: 'Size', choices: [{ value: 's' }] },
      ]);
      expect(mockPrisma.choiceList.findMany).toHaveBeenCalledWith({ where: { name: { in: ['gender', 'nope'] } } });
      expect(mockCache.set).toHaveBeenCalledWith('choice-lists:public:nope', null, 60_000);
    });

    it('404s for an unknown single list, 400s past 50 names', async () => {
      mockCache.getMany.mockResolvedValue([null]);
      await expect(service.publicOne('nope')).rejects.toThrow('Choice list "nope" not found');
      await expect(service.publicMany(Array.from({ length: 51 }, (_, i) => `l${i}`))).rejects.toThrow(BadRequestException);
    });
  });

  describe('import', () => {
    it('validates bundle lists into an override map without writing', async () => {
      mockPrisma.choiceList.findMany.mockResolvedValue([{ name: 'gender' }]);
      const errors: string[] = [];
      const map = await service.prepareImport([
        { name: 'gender', label: 'Gender', choices: ['f'] },
        { name: 'size', label: 'Size', choices: [] },
        { label: 'No name', choices: ['a'] },
      ], errors, false);
      expect([...map.keys()]).toEqual([]); // gender exists and overwrite is off
      expect(errors).toEqual(['Choice list "size": choices must be a non-empty array of { value, label? }', 'Choice list #3: missing or invalid name']);
      expect(mockPrisma.choiceList.create).not.toHaveBeenCalled();
    });
  });
});
