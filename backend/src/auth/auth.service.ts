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
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
    // Registration is only allowed during initial setup (no users exist)
    const setupRequired = await this.isSetupRequired();
    if (!setupRequired) {
      throw new ConflictException('Setup already completed. Use the admin panel to manage users.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hashedPassword },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    // Return token immediately — same shape as login()
    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      access_token: token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always run bcrypt to prevent timing-based email enumeration
    const dummyHash = '$2b$10$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordMatch = user
      ? await bcrypt.compare(dto.password, user.password)
      : await bcrypt.compare(dto.password, dummyHash).then(() => false);

    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      access_token: token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Generates a 15-minute password reset token and emails it to the user.
   * Always returns 200 — never reveals whether the email exists (prevents enumeration).
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // Invalidate any existing unused tokens for this user
      await (this.prisma as any).passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await (this.prisma as any).passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      const resetUrl = `${process.env.SITE_URL || process.env.APP_URL}/reset-password?token=${token}`;
      await this.sendResetEmail(email, resetUrl);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  /**
   * Validates the reset token and updates the user's password.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await (this.prisma as any).passwordResetToken.findUnique({ where: { token } });

    if (!record || record.used || new Date(record.expiresAt) < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    });

    await (this.prisma as any).passwordResetToken.update({
      where: { id: record.id },
      data: { used: true },
    });

    return { message: 'Password updated successfully' };
  }

  private async sendResetEmail(to: string, resetUrl: string): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;

    if (!smtpHost) {
      // SMTP not configured — log for development convenience
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
      text: `Click the link below to reset your password (expires in 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Click the link below to reset your password (expires in 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
    });
  }
}
