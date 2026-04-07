import { IsEmail, IsString, MinLength, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'editor@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: ['admin', 'editor', 'contributor', 'viewer'], default: 'editor' })
  @IsOptional()
  @IsIn(['admin', 'editor', 'contributor', 'viewer'])
  role?: string;
}
