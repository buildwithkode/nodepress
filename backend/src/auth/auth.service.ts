import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
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
}
