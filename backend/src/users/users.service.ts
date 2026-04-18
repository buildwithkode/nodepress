import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';

const USER_SELECT = { id: true, email: true, role: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException(`User "${dto.email}" already exists`);

    const hashed = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { email: dto.email, password: hashed, role: dto.role ?? 'editor' },
      select: USER_SELECT,
    });
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

  async updateRole(id: number, dto: UpdateUserDto, actorId: number) {
    const user = await this.findOne(id);

    if (dto.role && dto.role !== 'admin') {
      // Make sure we don't remove the last admin
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (user.role === 'admin' && adminCount <= 1) {
        throw new ForbiddenException('Cannot demote the last admin account');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: USER_SELECT,
    });
  }

  async remove(id: number, actorId: number) {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findOne(id);

    // Protect the last admin
    if (user.role === 'admin') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last admin account');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: `User "${user.email}" deleted` };
  }

  /**
   * Generate a password-reset token for the target user and send them an
   * invitation email containing a "Set Your Password" link.
   * Reuses the same PasswordResetToken table as the forgot-password flow.
   */
  async sendInvitation(userId: number, inviterEmail: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    // Invalidate any previous pending reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const baseUrl = process.env.SITE_URL || process.env.APP_URL || 'http://localhost:5173';
    const setPasswordUrl = `${baseUrl}/reset-password?token=${token}`;

    await this.mail.sendInvitation(user.email, setPasswordUrl, inviterEmail);

    return { message: `Invitation email sent to ${user.email}` };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    return { message: 'Password updated successfully' };
  }
}
