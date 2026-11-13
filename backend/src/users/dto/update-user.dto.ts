import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'editor', description: 'admin, editor, contributor, viewer or a custom role name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'OldPass123!' })
  @IsString()
  currentPassword: string;

  @ApiPropertyOptional({ example: 'NewPass456!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Priya Sharma', maxLength: 100, description: 'Shown in the admin; empty clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
