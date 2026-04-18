import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const hashedPassword = bcrypt.hashSync('Password123!', 10);

const mockAdmin = { id: 1, email: 'admin@test.com', role: 'admin',  password: hashedPassword, createdAt: new Date(), updatedAt: new Date() };
const mockEditor = { id: 2, email: 'editor@test.com', role: 'editor', password: hashedPassword, createdAt: new Date(), updatedAt: new Date() };

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
    count:      jest.fn(),
  },
  passwordResetToken: {
    updateMany: jest.fn().mockResolvedValue({}),
    create:     jest.fn().mockResolvedValue({ id: 1, token: 'tok', expiresAt: new Date() }),
  },
};

const mockMail = {
  sendInvitation: jest.fn().mockResolvedValue(undefined),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService,   useValue: mockMail   },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a user with hashed password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 2, email: 'new@test.com', role: 'editor', createdAt: new Date(), updatedAt: new Date() });

      const result = await service.create({ email: 'new@test.com', password: 'Password123!', role: 'editor' });

      expect(result.email).toBe('new@test.com');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      // Password must be hashed — not plain text
      const callArg = mockPrisma.user.create.mock.calls[0][0].data;
      expect(callArg.password).not.toBe('Password123!');
      expect(callArg.password.startsWith('$2b$')).toBe(true);
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      await expect(
        service.create({ email: 'editor@test.com', password: 'Password123!', role: 'editor' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns list of users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockAdmin, mockEditor]);
      const result = await service.findAll();
      expect(result).toHaveLength(2);
    });
  });

  // ── updateRole ─────────────────────────────────────────────────────────────

  describe('updateRole()', () => {
    it('changes role successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      mockPrisma.user.update.mockResolvedValue({ ...mockEditor, role: 'viewer' });

      const result = await service.updateRole(2, { role: 'viewer' }, 1);
      expect(result.role).toBe('viewer');
    });

    it('throws ForbiddenException when demoting last admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.count.mockResolvedValue(1); // only 1 admin

      await expect(
        service.updateRole(1, { role: 'editor' }, 99),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes another user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      mockPrisma.user.count.mockResolvedValue(1); // 1 admin (not this user)
      mockPrisma.user.delete.mockResolvedValue(mockEditor);

      const result = await service.remove(2, 1);
      expect(result.message).toContain('deleted');
    });

    it('throws ForbiddenException when deleting self', async () => {
      await expect(service.remove(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when deleting last admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.count.mockResolvedValue(1); // only 1 admin

      await expect(service.remove(1, 2)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('updates password when current password is correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.update.mockResolvedValue(mockAdmin);

      const result = await service.changePassword(1, {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword456!',
      });
      expect(result.message).toContain('updated');
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);

      await expect(
        service.changePassword(1, { currentPassword: 'wrongpassword', newPassword: 'NewPassword456!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── sendInvitation ─────────────────────────────────────────────────────────

  describe('sendInvitation()', () => {
    it('generates a reset token and sends invitation email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);

      const result = await service.sendInvitation(2, 'admin@test.com');

      expect(result.message).toContain('editor@test.com');
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 2, used: false } }),
      );
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
      expect(mockMail.sendInvitation).toHaveBeenCalledWith(
        'editor@test.com',
        expect.stringContaining('reset-password?token='),
        'admin@test.com',
      );
    });

    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.sendInvitation(999, 'admin@test.com')).rejects.toThrow(NotFoundException);
    });
  });
});
