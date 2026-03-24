import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['admin', 'editor', 'viewer'] })
  @IsOptional()
  @IsIn(['admin', 'editor', 'viewer'])
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
