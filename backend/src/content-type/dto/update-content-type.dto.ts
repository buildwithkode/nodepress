import { IsString, IsArray, IsOptional, ValidateNested, IsIn, ArrayUnique } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FieldDto } from './create-content-type.dto';

const ALLOWED_METHODS = ['list', 'read', 'create', 'update', 'delete'] as const;

export class UpdateContentTypeDto {
  @ApiPropertyOptional({ example: 'article' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Articles',
    description: 'Human-readable label shown in the admin UI. The snake_case key is still derived from `name`.',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: [FieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  schema?: FieldDto[];

  @ApiPropertyOptional({
    example: ['list', 'read'],
    description: 'Which API endpoints are enabled. null = all enabled.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(ALLOWED_METHODS, { each: true })
  @ArrayUnique()
  allowedMethods?: string[];
}
