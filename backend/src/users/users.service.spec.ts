import { Test, TestingModule } from '@nestjs/testing';
import { hashToken } from '../auth/token-hash';
import { ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
  role: {
    findUnique: jest.fn(),
  },
  refreshToken: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  passwordResetToken: {
    updateMany: jest.fn().mockResolvedValue({}),
    create:     jest.fn().mockResolvedValue({ id: 1, token: 'tok', expiresAt: new Date() }),
  },
};

const mockMail = {
  sendInvitation: jest.fn().mockResolvedValue(undefined),
  isConfigured: true,
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
    it('creates an invite-only user (random hashed password) and emails an invite', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 2, email: 'new@test.com', role: 'editor', createdAt: new Date(), updatedAt: new Date() });

      const result = await service.create({ email: 'new@test.com', role: 'editor' }, 'admin@test.com');

      expect(result.email).toBe('new@test.com');
      expect(result.invited).toBe(true);
      // No admin-set password — a random one is hashed (bcrypt $2b$ prefix).
      const callArg = mockPrisma.user.create.mock.calls[0][0].data;
      expect(callArg.password.startsWith('$2b$')).toBe(true);
      // An invitation link is issued + emailed.
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mockMail.sendInvitation).toHaveBeenCalledTimes(1);
      // The link carries the token; only its hash is stored
      const linkToken = new URL(mockMail.sendInvitation.mock.calls[0][1]).searchParams.get('token')!;
      expect(mockPrisma.passwordResetToken.create.mock.calls[0][0].data.token).toBe(hashToken(linkToken));
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      await expect(
        service.create({ email: 'editor@test.com', role: 'editor' }, 'admin@test.com'),
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

    it('accepts an existing custom role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      mockPrisma.role.findUnique.mockResolvedValue({ name: 'reviewer', baseRole: 'contributor' });
      mockPrisma.user.update.mockResolvedValue({ ...mockEditor, role: 'reviewer' });

      const result = await service.updateRole(2, { role: 'reviewer' }, 1);
      expect(result.role).toBe('reviewer');
      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'reviewer' } });
    });

    it('rejects a role that does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockEditor);
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.updateRole(2, { role: 'ghost' }, 1)).rejects.toThrow('Role "ghost" does not exist');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── non-admins with Users → Edit ───────────────────────────────────────────

  describe('a non-admin managing users', () => {
    const viewer = { ...mockEditor, id: 3, email: 'v@test.com', role: 'viewer' };

    it('cannot give the admin role, change an admin or their own role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(viewer);
      await expect(service.updateRole(3, { role: 'admin' }, 2, 'editor')).rejects.toThrow('Only an admin can give the admin role');
      await expect(service.updateRole(3, { role: 'viewer' }, 3, 'editor')).rejects.toThrow('You cannot change your own role');
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      await expect(service.updateRole(1, { role: 'viewer' }, 2, 'editor')).rejects.toThrow('Only an admin can change an admin account');
      await expect(service.remove(1, 2, 'editor')).rejects.toThrow(ForbiddenException);
      await expect(service.sendInvitation(1, 'e@test.com', 'editor')).rejects.toThrow(ForbiddenException);
      await expect(service.create({ email: 'x@test.com', role: 'admin' } as any, 'e@test.com', 'editor')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('can change other non-admin users', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(viewer);
      mockPrisma.user.update.mockResolvedValue({ ...viewer, role: 'contributor' });
      const result = await service.updateRole(3, { role: 'contributor' }, 2, 'editor');
      expect(result.role).toBe('contributor');
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

  describe('profile', () => {
    it('getProfile() returns your account without the password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, email: 'editor@test.com', name: null, role: 'editor', twoFactorEnabled: false });
      const profile = await service.getProfile(2);
      expect(profile.email).toBe('editor@test.com');
      const { select } = mockPrisma.user.findUnique.mock.calls[0][0];
      expect(select.password).toBeUndefined();
      expect(select.twoFactorSecret).toBeUndefined();
      expect(select.twoFactorEnabled).toBe(true);
    });

    it('getProfile() 404s for a deleted account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile(99)).rejects.toThrow(NotFoundException);
    });

    it('updateProfile() trims the name and only touches your own row', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, email: 'editor@test.com', name: 'Priya', role: 'editor' });
      await service.updateProfile(2, { name: '  Priya  ' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { name: 'Priya' } });
    });

    it('updateProfile() clears the name when it is blank', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, email: 'editor@test.com', name: null, role: 'editor' });
      await service.updateProfile(2, { name: '   ' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { name: null } });
    });
  });

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

    it('signs out other sessions but keeps the current one, and voids reset links', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.update.mockResolvedValue(mockAdmin);

      await service.changePassword(1, { currentPassword: 'Password123!', newPassword: 'NewPassword456!' }, 'mine');
      // The kept cookie is matched by its stored hash
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, token: { not: hashToken('mine') } } });
      // Every access token signed before stops working
      expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
      }));
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({ where: { userId: 1, used: false }, data: { used: true } });

      await service.changePassword(1, { currentPassword: 'Password123!', newPassword: 'NewPassword456!' });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenLastCalledWith({ where: { userId: 1 } });
    });

    it('throws BadRequestException when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);

      await expect(
        service.changePassword(1, { currentPassword: 'wrongpassword', newPassword: 'NewPassword456!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a common new password and keeps the old one', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.update.mockClear();
      await expect(
        service.changePassword(1, { currentPassword: 'Password123!', newPassword: 'password123' }),
      ).rejects.toThrow(/too common/);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('stores the new password at the current bcrypt cost', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);
      mockPrisma.user.update.mockClear();
      await service.changePassword(1, { currentPassword: 'Password123!', newPassword: 'NewPassword456!' });
      const saved = mockPrisma.user.update.mock.calls[0][0].data.password;
      expect(bcrypt.getRounds(saved)).toBe(12);
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
