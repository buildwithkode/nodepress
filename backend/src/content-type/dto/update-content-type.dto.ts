import { IsString, IsArray, IsOptional, ValidateNested, IsIn, ArrayUnique, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FieldDto } from './create-content-type.dto';
import { Matches, MaxLength } from 'class-validator';
import { PREVIEW_URL_MAX_LENGTH, PREVIEW_URL_PATTERN } from '../preview-url';

export class FieldRenameDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}

/** Move existing entry data along with the schema change (top-level fields). */
export class FieldMigrationsDto {
  @ApiPropertyOptional({ example: [{ from: 'headline', to: 'title' }], description: 'Move values to the renamed field' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldRenameDto)
  renames?: FieldRenameDto[];

  @ApiPropertyOptional({ example: ['price'], description: 'Retyped fields whose values are converted; values that cannot be converted are removed' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  convert?: string[];

  @ApiPropertyOptional({ example: ['legacy_notes'], description: 'Removed fields whose stored values are deleted' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  drop?: string[];
}

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

  @ApiPropertyOptional({
    example: 'https://site.example/blog/{slug}?token={token}',
    description: 'Live preview page for the entry editor. {slug}, {locale} and {token} are filled in. Empty or null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PREVIEW_URL_MAX_LENGTH)
  @Matches(PREVIEW_URL_PATTERN, { message: 'previewUrl must be an http(s) URL template' })
  previewUrl?: string | null;

  @ApiPropertyOptional({ type: FieldMigrationsDto, description: 'Migrate existing entry data: renames, conversions, drops' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMigrationsDto)
  fieldMigrations?: FieldMigrationsDto;
}
