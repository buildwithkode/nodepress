import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // setup-status is called on every page load — skip throttle to avoid false 429s
  @SkipThrottle()
  @Get('setup-status')
  @ApiOperation({ summary: 'Check if initial setup is required (no admin exists yet)' })
  @ApiResponse({ status: 200, description: '{ required: boolean }' })
  async setupStatus() {
    const required = await this.authService.isSetupRequired();
    return { required };
  }

  // 5 attempts per minute — prevents automated account creation
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  @ApiOperation({ summary: 'Create the first admin account (only works during initial setup)' })
  @ApiResponse({ status: 201, description: 'Admin created, returns JWT token' })
  @ApiResponse({ status: 409, description: 'Setup already completed' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // 10 attempts per minute — brute force protection on login
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({ summary: 'Login and receive a JWT token' })
  @ApiResponse({ status: 200, description: 'Returns access_token and user info' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Returns current user info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  me(@Request() req) {
    return req.user;
  }

  // 5 attempts per minute — prevents email enumeration fishing
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email (always returns 200)' })
  @ApiResponse({ status: 200, description: 'Reset link sent if email exists' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // 5 attempts per minute — prevents token brute-force
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a token from the reset email' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
