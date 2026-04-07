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
import * as nodemailer from 'nodemailer';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hashedPassword },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token, user: { id: user.id, email: user.email, role: user.role } };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always run bcrypt to prevent timing-based email enumeration
    const dummyHash = '$2b$10$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordMatch = user
      ? await bcrypt.compare(dto.password, user.password)
      : await bcrypt.compare(dto.password, dummyHash).then(() => false);

    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    await this.issueRefreshCookie(user.id, res);

    return { access_token, user: { id: user.id, email: user.email, role: user.role } };
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

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

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

      const resetUrl = `${process.env.SITE_URL || process.env.APP_URL}/reset-password?token=${token}`;
      await this.sendResetEmail(email, resetUrl);
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
      sameSite: 'strict',
      expires: expiresAt,
      path: '/api/auth',  // scoped — only sent to auth endpoints
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  private async sendResetEmail(to: string, resetUrl: string): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      this.logger.warn(`[Password Reset] No SMTP configured. Reset URL for ${to}: ${resetUrl}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? `NodePress <noreply@${smtpHost}>`,
      to,
      subject: 'Reset your NodePress password',
      text: `Reset link (expires in 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Click to reset your password (expires in 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  }
}
