import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Invite-only onboarding: the admin supplies only email + role. The account is
// created without an admin-set password; the user sets their own via the
// emailed invitation link. (No password field by design.)
export class CreateUserDto {
  @ApiProperty({ example: 'editor@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'editor', default: 'editor', description: 'admin, editor, contributor, viewer or a custom role name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;
}
