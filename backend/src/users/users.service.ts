import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ChangePasswordDto, UpdateProfileDto } from './dto/update-user.dto';
import { isBuiltInRole } from '../roles/roles.constants';
import { assertAcceptablePassword, hashPassword, unusablePasswordHash, verifyPassword } from '../auth/password';
import { hashToken } from '../auth/token-hash';

/** The name to greet someone by: their name, else the email's local part. */
function nameOf(user: { email: string; name?: string | null }): string {
  return user.name?.trim() || user.email.split('@')[0];
}

const USER_SELECT = { id: true, email: true, name: true, role: true, twoFactorEnabled: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /**
   * Invite-only create: the admin supplies email + role, never a password.
   * The account is created with a random, unusable password (the column is
   * NOT NULL), then an invitation link is emailed so the user sets their own.
   * When SMTP is not configured, the link is returned so the admin can deliver
   * it manually (the caller is an authenticated admin).
   */
  async create(dto: CreateUserDto, inviterEmail: string, actorRole = 'admin') {
    this.assertMayManage(actorRole, null, dto.role ?? 'editor');
    if (dto.role) await this.assertRoleExists(dto.role);
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException(`User "${dto.email}" already exists`);

    // No admin-set password — random hash the user can never know until they
    // set their own via the invitation link.
    const hashed = await unusablePasswordHash();
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hashed, role: dto.role ?? 'editor' },
      select: USER_SELECT,
    });

    const setPasswordUrl = await this.issueInviteToken(user.id);
    this.mail.sendInvitation(user.email, setPasswordUrl, inviterEmail).catch((err: any) => {
      // Log warning in background
    });

    if (user.role === 'admin') {
      this.background(`New admin email for ${user.email}`, async () => {
        const actor = await this.prisma.user.findUnique({ where: { email: inviterEmail }, select: { id: true } });
        await this.notifyNewAdmin(user, 'invited', actor?.id);
      });
    }

    // In non-production or when SMTP is unconfigured, return the inviteUrl for instant manual onboarding
    const inviteUrl = (process.env.NODE_ENV !== 'production' || !this.mail.isConfigured) ? setPasswordUrl : undefined;
    return { ...user, invited: true, inviteUrl };
  }

  /**
   * Create + store a fresh password-set token for a user and return the link.
   * Shared by create() (initial invite) and sendInvitation() (resend).
   * Invalidates any pending tokens first. 7-day expiry — long enough for an
   * onboarding invite (the short-lived forgot-password flow lives in AuthService).
   */
  private async issueInviteToken(userId: number): Promise<string> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    // Only the hash is stored; the invitation link carries the token itself
    await this.prisma.passwordResetToken.create({
      data: { userId, token: hashToken(token), expiresAt },
    });
    const baseUrl = process.env.SITE_URL || process.env.APP_URL || 'http://localhost:5173';
    return `${baseUrl}/reset-password?token=${token}`;
  }

  /**
   * Users → Edit can be given to non-admin roles, but only admins create,
   * change, remove or re-invite admins (an invite link sets the password).
   */
  private assertMayManage(actorRole: string, target: { role: string } | null, newRole?: string) {
    if (actorRole === 'admin') return;
    if (target?.role === 'admin') throw new ForbiddenException('Only an admin can change an admin account');
    if (newRole === 'admin') throw new ForbiddenException('Only an admin can give the admin role');
  }

  /** A built-in role or the name of an existing custom role (see RolesModule). */
  private async assertRoleExists(role: string) {
    if (isBuiltInRole(role)) return;
    const custom = await this.prisma.role.findUnique({ where: { name: role } });
    if (!custom) throw new BadRequestException(`Role "${role}" does not exist`);
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: USER_SELECT,
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async updateRole(id: number, dto: UpdateUserDto, actorId: number, actorRole = 'admin') {
    const user = await this.findOne(id);
    this.assertMayManage(actorRole, user, dto.role);
    if (actorRole !== 'admin' && id === actorId) throw new ForbiddenException('You cannot change your own role');
    if (dto.role) await this.assertRoleExists(dto.role);

    if (dto.role && dto.role !== 'admin') {
      // Make sure we don't remove the last admin
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (user.role === 'admin' && adminCount <= 1) {
        throw new ForbiddenException('Cannot demote the last admin account');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: USER_SELECT,
    });

    // Tell them, in the background: a slow mail server must not hold up the Users page.
    if (dto.role && dto.role !== user.role) {
      void this.notifyRoleChanged(updated, user.role, dto.role, actorId).catch((err) =>
        this.logger.warn(`Role change email to ${updated.email} failed: ${err?.message ?? err}`),
      );
      if (dto.role === 'admin') {
        this.background(`New admin email for ${updated.email}`, async () =>
          this.notifyNewAdmin(updated, 'promoted', actorId, await this.roleLabel(user.role)));
      }
    }
    return updated;
  }

  /** Email the user whose role changed: who changed it, before and now. */
  private async notifyRoleChanged(
    user: { email: string; name?: string | null },
    previousRole: string,
    newRole: string,
    actorId: number,
  ) {
    if (!this.mail.isConfigured) return;
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true, name: true } });
    await this.mail.sendRoleChanged({
      to: user.email,
      recipientName: user.name?.trim() || user.email.split('@')[0],
      changedByName: actor?.name?.trim() || actor?.email || 'An admin',
      changedByEmail: actor?.email ?? '',
      previousRole: await this.roleLabel(previousRole),
      newRole: await this.roleLabel(newRole),
    });
  }

  /**
   * Tell every admin (the one who did it included — their account may be the
   * one misused) that someone became an admin. The new admin is left out.
   */
  private async notifyNewAdmin(
    newAdmin: { id: number; email: string; name?: string | null },
    how: 'invited' | 'promoted',
    actorId: number | undefined,
    previousRole?: string,
  ) {
    if (!this.mail.isConfigured) return;
    const [admins, actor] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'admin', id: { not: newAdmin.id } }, select: { email: true, name: true } }),
      actorId ? this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true, name: true } }) : null,
    ]);
    const when = new Date();
    for (const admin of admins) {
      await this.mail.sendNewAdmin({
        to: admin.email,
        recipientName: nameOf(admin),
        newAdminName: newAdmin.name?.trim() || newAdmin.email,
        newAdminEmail: newAdmin.email,
        byName: actor?.name?.trim() || actor?.email || 'An admin',
        byEmail: actor?.email ?? '',
        how,
        previousRole,
        when,
      });
    }
  }

  /** Run a notice email without holding up the response; failures are only logged. */
  private background(what: string, task: () => Promise<unknown>) {
    void Promise.resolve()
      .then(task)
      .catch((err) => this.logger.warn(`${what} failed: ${err?.message ?? err}`));
  }

  /** "Admin" for a built-in role, the label for a custom one ("Reviewer"). */
  private async roleLabel(role: string): Promise<string> {
    if (isBuiltInRole(role)) return role.charAt(0).toUpperCase() + role.slice(1);
    const custom = await this.prisma.role.findUnique({ where: { name: role }, select: { label: true } });
    return custom?.label || role;
  }

  async remove(id: number, actorId: number, actorRole = 'admin') {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findOne(id);
    this.assertMayManage(actorRole, user);

    // Protect the last admin
    if (user.role === 'admin') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last admin account');
      }
    }

    await this.prisma.user.delete({ where: { id } });

    this.background(`Account removed email to ${user.email}`, async () => {
      if (!this.mail.isConfigured) return;
      const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true, name: true } });
      await this.mail.sendAccountRemoved({
        to: user.email,
        recipientName: nameOf(user),
        removedByName: actor?.name?.trim() || actor?.email || 'An admin',
        removedByEmail: actor?.email ?? '',
        when: new Date(),
      });
    });
    return { message: `User "${user.email}" deleted` };
  }

  /**
   * Generate a password-reset token for the target user and send them an
   * invitation email containing a "Set Your Password" link.
   * Reuses the same PasswordResetToken table as the forgot-password flow.
   */
  async sendInvitation(userId: number, inviterEmail: string, actorRole = 'admin'): Promise<{ message: string; inviteUrl?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);
    this.assertMayManage(actorRole, user);

    const setPasswordUrl = await this.issueInviteToken(user.id);
    this.mail.sendInvitation(user.email, setPasswordUrl, inviterEmail).catch((err: any) => {
      // Log warning in background
    });

    return {
      message: `Invitation sent to ${user.email}`,
      inviteUrl: (process.env.NODE_ENV !== 'production' || !this.mail.isConfigured) ? setPasswordUrl : undefined,
    };
  }

  /**
   * Change your own password. Every other session (refresh token) is signed out
   * and unused reset/invite links stop working; `keepRefreshToken` — the caller's
   * own np_refresh cookie — survives so this browser stays signed in.
   */
  /** Your own account, for the profile page. */
  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Change your own name. An empty name clears it (the admin then shows the email). */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const data: { name?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async changePassword(userId: number, dto: ChangePasswordDto, keepRefreshToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await verifyPassword(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    await assertAcceptablePassword(dto.newPassword, user.email);

    const hashed = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      // A new session version cancels every access token signed before, this
      // browser's too: it gets a new one from its kept refresh cookie
      this.prisma.user.update({ where: { id: userId }, data: { password: hashed, sessionVersion: { increment: 1 } } }),
      this.prisma.refreshToken.deleteMany({
        where: { userId, ...(keepRefreshToken ? { token: { not: hashToken(keepRefreshToken) } } : {}) },
      }),
      this.prisma.passwordResetToken.updateMany({ where: { userId, used: false }, data: { used: true } }),
    ]);
    this.background(`Password changed email to ${user.email}`, () =>
      this.mail.sendPasswordChanged({ to: user.email, recipientName: nameOf(user), via: 'profile', when: new Date() }));
    return { message: 'Password updated successfully' };
  }
}
