import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RolesService } from '../roles/roles.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  assertAcceptablePassword, hashPassword, needsRehash, verifyAgainstDummy, verifyPassword,
} from './password';
import { hashToken } from './token-hash';
import { isSealedTotpSecret, readTotpSecret, sealTotpSecret } from './totp-secret';

const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_COOKIE = 'np_refresh';

/** What an access token is signed from: `sv` ties it to the user's current session version. */
interface SessionSubject {
  id: number;
  email: string;
  sessionVersion?: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
    private roles: RolesService,
  ) {}

  /** Encrypt 2FA secrets saved before they were stored encrypted. Never blocks startup. */
  async onModuleInit() {
    try {
      const users = await this.prisma.user.findMany({
        where: { twoFactorSecret: { not: null } },
        select: { id: true, twoFactorSecret: true },
      });
      let sealed = 0;
      for (const u of users) {
        if (!u.twoFactorSecret || isSealedTotpSecret(u.twoFactorSecret)) continue;
        // Conditional on the old value, so instances starting together don't double-encrypt
        const { count } = await this.prisma.user.updateMany({
          where: { id: u.id, twoFactorSecret: u.twoFactorSecret },
          data: { twoFactorSecret: sealTotpSecret(u.twoFactorSecret) },
        });
        sealed += count;
      }
      if (sealed) this.logger.log(`Encrypted ${sealed} stored 2FA secret(s)`);
    } catch (err: any) {
      this.logger.warn(`Could not encrypt stored 2FA secrets: ${err?.message}`);
    }
  }

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
    await assertAcceptablePassword(dto.password, normalizedEmail);
    const hashedPassword = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword, role: 'admin' },
      select: { id: true, email: true, role: true, createdAt: true, sessionVersion: true },
    });

    const access_token = await this.signAccessToken(user);
    return { access_token, user: await this.sessionUser(user) };
  }

  async login(dto: LoginDto, res: Response) {
    const normalizedEmail = dto.email?.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user && normalizedEmail && typeof this.prisma.user.findFirst === 'function') {
      user = await this.prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
    }

    // Always run bcrypt (at the same cost) so timing doesn't reveal which emails exist
    const passwordMatch = user
      ? await verifyPassword(dto.password, user.password)
      : await verifyAgainstDummy(dto.password);

    if (!user || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Upgrade a hash made with an older, cheaper cost while we have the password
    if (needsRehash(user.password)) {
      try {
        const upgraded = await hashPassword(dto.password);
        await this.prisma.user.updateMany({
          where: { id: user.id, password: user.password },
          data: { password: upgraded },
        });
      } catch (err: any) {
        // Signing in matters more than the upgrade; it is tried again next time
        this.logger.warn(`Could not upgrade password hash: ${err?.message}`);
      }
    }

    // If Two-Factor Authentication is enabled, return a 5-minute temporary token
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, purpose: '2fa_pending' },
        { expiresIn: '5m' },
      );
      return { requires2fa: true, tempToken };
    }

    const access_token = await this.signAccessToken(user);
    await this.issueRefreshCookie(user.id, res);

    return { access_token, user: await this.sessionUser(user) };
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
    const secret = readTotpSecret(user.twoFactorSecret);
    const isTotpValid = !!secret && verifyTotp(code, secret);

    if (isTotpValid) {
      const access_token = await this.signAccessToken(user);
      await this.issueRefreshCookie(user.id, res);
      return { access_token, user: await this.sessionUser(user) };
    }

    // Check backup recovery codes
    const recoveryList = Array.isArray(user.twoFactorRecovery) ? (user.twoFactorRecovery as string[]) : [];
    const recoveryResult = verifyAndConsumeRecoveryCode(code, recoveryList);

    if (recoveryResult.valid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecovery: recoveryResult.remainingHashes },
      });

      const access_token = await this.signAccessToken(user);
      await this.issueRefreshCookie(user.id, res);
      return {
        access_token,
        user: await this.sessionUser(user),
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

  /**
   * Turn 2FA on. Every other session is signed out (they started without the
   * second factor); `keepRefreshToken`, the caller's own cookie, survives and
   * a new access token for this browser is returned.
   */
  async enable2fa(
    userId: number, secret: string, code: string, hashedRecoveryCodes: string[], keepRefreshToken?: string,
  ) {
    const { verifyTotp } = require('./totp.util');
    if (!verifyTotp(code, secret)) {
      throw new BadRequestException('Invalid verification code. Please check your authenticator app.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: sealTotpSecret(secret),
        twoFactorRecovery: hashedRecoveryCodes,
        sessionVersion: { increment: 1 },
      },
    });
    await this.endOtherRefreshSessions(userId, keepRefreshToken);

    return {
      success: true,
      message: 'Two-Factor Authentication enabled successfully',
      access_token: await this.signAccessToken(user),
    };
  }

  async disable2fa(userId: number, code: string, keepRefreshToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      return { success: true, message: '2FA is already disabled' };
    }

    const { verifyTotp, verifyAndConsumeRecoveryCode } = require('./totp.util');
    const secret = readTotpSecret(user.twoFactorSecret);
    const isTotpValid = !!secret && verifyTotp(code, secret);
    const recoveryList = Array.isArray(user.twoFactorRecovery) ? (user.twoFactorRecovery as string[]) : [];
    const isRecoveryValid = verifyAndConsumeRecoveryCode(code, recoveryList).valid;

    if (!isTotpValid && !isRecoveryValid) {
      throw new BadRequestException('Invalid 2FA code or recovery code');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecovery: null,
        sessionVersion: { increment: 1 },
      },
    });
    await this.endOtherRefreshSessions(userId, keepRefreshToken);

    return {
      success: true,
      message: 'Two-Factor Authentication disabled successfully',
      access_token: await this.signAccessToken(updated),
    };
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
    const record = refreshToken
      ? await this.prisma.refreshToken.findUnique({ where: { token: hashToken(refreshToken) } })
      : null;

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

    const access_token = await this.signAccessToken(user);
    return { access_token };
  }

  async logout(refreshToken: string | undefined, res: Response): Promise<{ message: string }> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({ where: { token: hashToken(refreshToken) } });
    }
    this.clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  /**
   * Sign out everywhere: every access token issued so far stops working at
   * once (the session version moves on) and every refresh token is deleted,
   * this browser's included.
   */
  async logoutEverywhere(userId: number, res: Response): Promise<{ message: string }> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    this.clearRefreshCookie(res);
    return { message: 'Signed out on all devices' };
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

      // Only the hash is stored; the link in the email carries the token itself
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token: hashToken(token), expiresAt },
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
    const record = token
      ? await this.prisma.passwordResetToken.findUnique({ where: { token: hashToken(token) } })
      : null;

    if (!record || record.used || new Date(record.expiresAt) < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const owner = await this.prisma.user.findUnique({ where: { id: record.userId }, select: { email: true } });
    await assertAcceptablePassword(newPassword, owner?.email);

    const hashed = await hashPassword(newPassword);
    // Revoke every session: access tokens stop working (new session version)
    // and stolen refresh tokens are deleted
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed, sessionVersion: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return { message: 'Password updated successfully' };
  }

  /** The user a verified SSO code belongs to (it may have been deleted since). */
  async findUserForSession(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return user;
  }

  /**
   * Start a session for an already-authenticated user (e.g. after SSO): the
   * same access token + rotating refresh cookie as a password login.
   */
  async createSession(user: SessionSubject & { role: string }, res: Response) {
    const access_token = await this.signAccessToken(user);
    await this.issueRefreshCookie(user.id, res);
    return { access_token, user: await this.sessionUser(user) };
  }

  /**
   * An access token carries the user's session version (`sv`); the JWT checks
   * refuse it once the version moves on (password change or reset, 2FA change,
   * sign out everywhere). Reads the version when the caller doesn't have it.
   */
  async signAccessToken(user: SessionSubject): Promise<string> {
    let sv = user.sessionVersion;
    if (sv === undefined) {
      const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { sessionVersion: true } });
      sv = row?.sessionVersion ?? 0;
    }
    return this.jwtService.sign({ sub: user.id, email: user.email, sv });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** The user object sent to the admin: role is the base role, customRole the custom one (if any). */
  private async sessionUser(user: { id: number; email: string; role: string }) {
    const { role, customRole } = await this.roles.resolve(user.role);
    return { id: user.id, email: user.email, role, ...(customRole && { customRole }) };
  }

  /** Delete the user's refresh tokens except the caller's own (`keep`, the raw cookie value). */
  private async endOtherRefreshSessions(userId: number, keep?: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, ...(keep ? { token: { not: hashToken(keep) } } : {}) },
    });
  }

  private async issueRefreshCookie(userId: number, res: Response): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Only the hash is stored; the browser keeps the token in the HttpOnly cookie
    await this.prisma.refreshToken.create({ data: { userId, token: hashToken(token), expiresAt } });

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
