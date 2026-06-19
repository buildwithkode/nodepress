import { IsEmail, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Invite-only onboarding: the admin supplies only email + role. The account is
// created without an admin-set password; the user sets their own via the
// emailed invitation link. (No password field by design.)
export class CreateUserDto {
  @ApiProperty({ example: 'editor@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['admin', 'editor', 'contributor', 'viewer'], default: 'editor' })
  @IsOptional()
  @IsIn(['admin', 'editor', 'contributor', 'viewer'])
  role?: string;
}
