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

  @ApiPropertyOptional({ example: 'NewPass456!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
