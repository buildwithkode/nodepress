import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { FormsService } from './forms.service';
import { PrismaService } from '../prisma/prisma.service';

const mockForm = {
  id: 1,
  name: 'Contact Us',
  slug: 'contact-us',
  fields: [],
  actions: [],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { submissions: 5 },
};

const mockPrisma = {
  form: {
    create:     jest.fn(),
    count:      jest.fn(),
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
  },
  formSubmission: {
    count:    jest.fn(),
    findMany: jest.fn(),
  },
};

describe('FormsService', () => {
  let service: FormsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(FormsService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('normalizes slug and persists the form', async () => {
      mockPrisma.form.create.mockResolvedValue(mockForm);

      await service.create({ name: 'Contact Us', slug: 'Contact Us', fields: [], actions: [] });

      const callData = mockPrisma.form.create.mock.calls[0][0].data;
      expect(callData.slug).toBe('contact-us'); // normalized
    });

    it('throws ConflictException on duplicate slug (P2002)', async () => {
      mockPrisma.form.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create({ name: 'Test', slug: 'contact-us', fields: [], actions: [] }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for reserved slugs', async () => {
      await expect(
        service.create({ name: 'Submit Form', slug: 'submit', fields: [], actions: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated forms with meta', async () => {
      mockPrisma.form.count.mockResolvedValue(1);
      mockPrisma.form.findMany.mockResolvedValue([mockForm]);

      const result = await service.findAll(1, 50);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns form when found', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(mockForm);
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates allowed fields', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(mockForm);
      mockPrisma.form.update.mockResolvedValue({ ...mockForm, isActive: false });

      const result = await service.update(1, { isActive: false });
      expect(mockPrisma.form.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ isActive: false }) }),
      );
      expect(result.isActive).toBe(false);
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes a form', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(mockForm);
      mockPrisma.form.delete.mockResolvedValue(mockForm);

      await service.remove(1);
      expect(mockPrisma.form.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  // ── findBySlug ──────────────────────────────────────────────────────────────

  describe('findBySlug()', () => {
    it('returns the form when active', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(mockForm);
      const result = await service.findBySlug('contact-us');
      expect(result.slug).toBe('contact-us');
    });

    it('throws NotFoundException for unknown slug', async () => {
      mockPrisma.form.findUnique.mockResolvedValue(null);
      await expect(service.findBySlug('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when form is inactive', async () => {
      mockPrisma.form.findUnique.mockResolvedValue({ ...mockForm, isActive: false });
      await expect(service.findBySlug('contact-us')).rejects.toThrow(BadRequestException);
    });
  });

  // ── findSubmissions ──────────────────────────────────────────────────────────

  describe('findSubmissions()', () => {
    it('returns paginated submissions for a form', async () => {
      mockPrisma.formSubmission.count.mockResolvedValue(3);
      mockPrisma.formSubmission.findMany.mockResolvedValue([
        { id: 1, formId: 1, data: { name: 'Alice' }, createdAt: new Date() },
      ]);

      const result = await service.findSubmissions(1, 1, 50);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(3);
    });
  });
});
