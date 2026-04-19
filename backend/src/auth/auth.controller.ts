import { Controller, Post, Body, Get, UseGuards, Request, Response, Res } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth,
} from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
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

  @SkipThrottle()
  @Get('setup-status')
  @ApiOperation({ summary: 'Check if initial setup is required (no admin exists yet)' })
  @ApiResponse({ status: 200, description: '{ required: boolean }' })
  async setupStatus() {
    return { required: await this.authService.isSetupRequired() };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  @ApiOperation({ summary: 'Create the first admin account (only works during initial setup)' })
  @ApiResponse({ status: 201, description: 'Admin created, returns JWT access token' })
  @ApiResponse({ status: 409, description: 'Setup already completed' })
  register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: ExpressResponse) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: process.env.NODE_ENV === 'production' ? 10 : 100 } })
  @Post('login')
  @ApiOperation({ summary: 'Login — returns a short-lived access token and sets an HttpOnly refresh cookie' })
  @ApiResponse({ status: 200, description: 'Returns access_token (7d) + sets np_refresh cookie (30 days)' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: ExpressResponse) {
    return this.authService.login(dto, res);
  }

  @SkipThrottle()
  @Post('refresh')
  @ApiCookieAuth('np_refresh')
  @ApiOperation({ summary: 'Exchange the HttpOnly refresh cookie for a new access token (rotates the refresh token)' })
  @ApiResponse({ status: 200, description: 'Returns new access_token' })
  @ApiResponse({ status: 401, description: 'Refresh token missing, expired, or invalid' })
  refresh(@Request() req, @Res({ passthrough: true }) res: ExpressResponse) {
    const token = req.cookies?.['np_refresh'];
    if (!token) throw new (require('@nestjs/common').UnauthorizedException)('No refresh token');
    return this.authService.refresh(token, res);
  }

  @SkipThrottle()
  @Post('logout')
  @ApiOperation({ summary: 'Invalidate the refresh token and clear the cookie' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  logout(@Request() req, @Res({ passthrough: true }) res: ExpressResponse) {
    return this.authService.logout(req.cookies?.['np_refresh'], res);
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

  @Throttle({ default: { ttl: 60_000, limit: process.env.NODE_ENV === 'production' ? 5 : 50 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email (always returns 200)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: process.env.NODE_ENV === 'production' ? 5 : 50 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a token from the reset email' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
