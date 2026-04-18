import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const mockUser = {
  id: 1,
  email: 'admin@test.com',
  password: bcrypt.hashSync('Password123!', 10),
  role: 'admin',
  createdAt: new Date(),
};

const mockPrisma = {
  user: {
    count:      jest.fn(),
    create:     jest.fn(),
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockMail = {
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService,    useValue: mockJwt },
        { provide: MailService,   useValue: mockMail },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── isSetupRequired ────────────────────────────────────────────────────────

  describe('isSetupRequired()', () => {
    it('returns true when no users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      expect(await service.isSetupRequired()).toBe(true);
    });

    it('returns false when users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      expect(await service.isSetupRequired()).toBe(false);
    });
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('creates first admin and returns access_token', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.create.mockResolvedValue({
        id: 1, email: 'admin@test.com', role: 'admin', createdAt: new Date(),
      });

      const result = await service.register({ email: 'admin@test.com', password: 'Password123!' });

      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.user.email).toBe('admin@test.com');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when setup already done', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      await expect(
        service.register({ email: 'second@test.com', password: 'Password123!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const mockRes: any = {
      cookie: jest.fn(),
    };

    beforeEach(() => {
      // Stub refresh token creation
      mockPrisma.$queryRaw.mockResolvedValue(undefined);
    });

    it('returns access_token with correct credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      // refreshToken.create is accessed via (prisma as any)
      (mockPrisma as any).refreshToken = { create: jest.fn() };

      const result = await service.login(
        { email: 'admin@test.com', password: 'Password123!' },
        mockRes,
      );

      expect(result.access_token).toBe('mock.jwt.token');
      expect(result.user.email).toBe('admin@test.com');
      expect((result.user as any).password).toBeUndefined();
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@test.com', password: 'Password123!' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      await expect(
        service.login({ email: 'admin@test.com', password: 'WrongPassword!' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
