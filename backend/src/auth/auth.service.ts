import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_COOKIE = 'np_refresh';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
  ) {}

  /** Returns true if no admin account exists yet */
  async isSetupRequired(): Promise<boolean> {
    const count = await this.prisma.user.count();
    return count === 0;
  }

  async register(dto: RegisterDto) {
    const setupRequired = await this.isSetupRequired();
    if (!setupRequired) {
      throw new ConflictException('Setup already completed. Use the admin panel to manage users.');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword, role: 'admin' },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token, user: { id: user.id, email: user.email, role: user.role } };
  }

  async login(dto: LoginDto, res: Response) {
    const normalizedEmail = dto.email?.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user && normalizedEmail && typeof this.prisma.user.findFirst === 'function') {
      user = await this.prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
    }

    // Always run bcrypt to prevent timing-based email enumeration
    const dummyHash = '$2b$10$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordMatch = user
      ? await bcrypt.compare(dto.password, user.password)
      : await bcrypt.compare(dto.password, dummyHash).then(() => false);

    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If Two-Factor Authentication is enabled, return a 5-minute temporary token
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, purpose: '2fa_pending' },
        { expiresIn: '5m' },
      );
      return { requires2fa: true, tempToken };
    }

    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    await this.issueRefreshCookie(user.id, res);

    return { access_token, user: { id: user.id, email: user.email, role: user.role } };
  }

  // ── Two-Factor Authentication (2FA / TOTP) ──────────────────────────────────

  async verify2faLogin(tempToken: string, code: string, res: Response) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('Two-factor session expired or invalid. Please log in again.');
    }

    if (payload.purpose !== '2fa_pending') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException('User not found or 2FA not configured');
    }

    const { verifyTotp, verifyAndConsumeRecoveryCode } = require('./totp.util');
    const isTotpValid = verifyTotp(code, user.twoFactorSecret);

    if (isTotpValid) {
      const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
      await this.issueRefreshCookie(user.id, res);
      return { access_token, user: { id: user.id, email: user.email, role: user.role } };
    }

    // Check backup recovery codes
    const recoveryList = Array.isArray(user.twoFactorRecovery) ? (user.twoFactorRecovery as string[]) : [];
    const recoveryResult = verifyAndConsumeRecoveryCode(code, recoveryList);

    if (recoveryResult.valid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecovery: recoveryResult.remainingHashes },
      });

      const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
      await this.issueRefreshCookie(user.id, res);
      return {
        access_token,
        user: { id: user.id, email: user.email, role: user.role },
        recoveryUsed: true,
        remainingRecoveryCodes: recoveryResult.remainingHashes.length,
      };
    }

    throw new UnauthorizedException('Invalid verification code or recovery code');
  }

  async setup2fa(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const { generateSecret, generateRecoveryCodes } = require('./totp.util');
    const { secret, otpauthUrl } = generateSecret(user.email, 'NodePress');
    const { codes, hashedCodes } = generateRecoveryCodes(8);

    return {
      secret,
      otpauthUrl,
      recoveryCodes: codes,
      hashedRecoveryCodes: hashedCodes,
    };
  }

  async enable2fa(userId: number, secret: string, code: string, hashedRecoveryCodes: string[]) {
    const { verifyTotp } = require('./totp.util');
    if (!verifyTotp(code, secret)) {
      throw new BadRequestException('Invalid verification code. Please check your authenticator app.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorRecovery: hashedRecoveryCodes,
      },
    });

    return { success: true, message: 'Two-Factor Authentication enabled successfully' };
  }

  async disable2fa(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      return { success: true, message: '2FA is already disabled' };
    }

    const { verifyTotp, verifyAndConsumeRecoveryCode } = require('./totp.util');
    const isTotpValid = user.twoFactorSecret && verifyTotp(code, user.twoFactorSecret);
    const recoveryList = Array.isArray(user.twoFactorRecovery) ? (user.twoFactorRecovery as string[]) : [];
    const isRecoveryValid = verifyAndConsumeRecoveryCode(code, recoveryList).valid;

    if (!isTotpValid && !isRecoveryValid) {
      throw new BadRequestException('Invalid 2FA code or recovery code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecovery: null,
      },
    });

    return { success: true, message: 'Two-Factor Authentication disabled successfully' };
  }

  async get2faStatus(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return { enabled: user?.twoFactorEnabled ?? false };
  }

  /**
   * Validates the HttpOnly refresh token cookie, rotates it, and returns a
   * fresh short-lived access token. Uses token rotation — each refresh issues
   * a new refresh token and invalidates the old one.
   */
  async refresh(refreshToken: string, res: Response): Promise<{ access_token: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!record || new Date(record.expiresAt) < new Date()) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Refresh token expired or invalid — please log in again');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('User not found');
    }

    // Rotate: delete old token, issue new one
    await this.prisma.refreshToken.delete({ where: { id: record.id } });
    await this.issueRefreshCookie(user.id, res);

    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token };
  }

  async logout(refreshToken: string | undefined, res: Response): Promise<{ message: string }> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    this.clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  // ── Password reset ──────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string; devResetUrl?: string }> {
    const normalizedEmail = email?.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user && normalizedEmail && typeof this.prisma.user.findFirst === 'function') {
      user = await this.prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
    }

    if (user) {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      const resetUrl = `${process.env.SITE_URL || process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
      
      // Send email in background so slow SMTP never blocks or hangs the user's HTTP request
      this.mail.sendPasswordReset(user.email, resetUrl).catch((err: any) => {
        this.logger.warn(`Failed to dispatch password reset email: ${err?.message}`);
      });

      // In development, expose the reset URL in the response so developers and local
      // testers have an instant reset link right on screen without needing external SMTP.
      if (process.env.NODE_ENV !== 'production') {
        return {
          message: 'If that email exists, a reset link has been sent.',
          devResetUrl: resetUrl,
        };
      }
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.used || new Date(record.expiresAt) < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } });

    // Revoke all active sessions — stolen refresh tokens are no longer valid after a password reset
    await this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } });

    return { message: 'Password updated successfully' };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async issueRefreshCookie(userId: number, res: Response): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } });

    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/api/auth',  // scoped — only sent to auth endpoints
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

}
