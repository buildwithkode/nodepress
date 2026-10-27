import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BASE_ROLES } from '../roles.constants';

export class CreateRoleDto {
  @ApiProperty({ example: 'reviewer', description: 'Normalized to snake_case. Cannot be changed later.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'Reviewer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 'Reviews blog posts before an editor publishes them' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: BASE_ROLES, description: 'Built-in role whose admin-area access this role gets' })
  @IsIn(BASE_ROLES as unknown as string[])
  baseRole: string;
}

/** The name is immutable — users and permission rows refer to it. */
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Reviewer' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ enum: BASE_ROLES })
  @IsOptional()
  @IsIn(BASE_ROLES as unknown as string[])
  baseRole?: string;
}

export class SetAccessDto {
  @ApiProperty({ example: { media: 'edit', forms: 'view', users: 'none' }, description: 'Module key → none | view | edit' })
  @IsObject()
  modules: Record<string, string>;
}
