import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsOptional, IsBoolean, ArrayUnique, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_FIELD_TYPES } from '../../fields/field.types';
import { PREVIEW_URL_MAX_LENGTH, PREVIEW_URL_PATTERN } from '../preview-url';

export class FieldDto {
  @ApiProperty({ example: 'title' })
  @IsString()
  @IsNotEmpty()
  name: string;

  // The canonical registry, so a new field type can't be forgotten here.
  @ApiProperty({ example: 'text', enum: ALL_FIELD_TYPES })
  @IsString()
  @IsIn(ALL_FIELD_TYPES)
  type: string;

  @ApiPropertyOptional({ example: 'Article Title' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 'Short description shown below the field' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Build a database index for ?where[field] filters (top-level text, number, boolean, select, date, datetime, color, relation fields)',
  })
  @IsOptional()
  @IsBoolean()
  indexed?: boolean;

  @ApiPropertyOptional({
    description: 'Type-specific config — subFields for repeater, layouts for flexible, choices for select, min/max for number/text',
    example: { subFields: [{ name: 'image', type: 'image' }] },
  })
  @IsOptional()
  options?: any;

  @ApiPropertyOptional({
    example: { field: 'kind', op: 'eq', value: 'video' },
    description: 'Show the field only when a field next to it matches (op: eq, ne, in, notIn, set, notSet). A hidden field is never required.',
  })
  @IsOptional()
  condition?: any;

  @ApiPropertyOptional({
    example: 'seo',
    description: 'Top-level fields inserted inline from a reusable component carry its name; the server replaces each run of them with the component\'s current fields.',
  })
  @IsOptional()
  @IsString()
  component?: string;

  @ApiPropertyOptional({ example: ['admin', 'editor'] })
  @IsOptional()
  @IsArray()
  readRoles?: string[];

  @ApiPropertyOptional({ example: ['admin'] })
  @IsOptional()
  @IsArray()
  writeRoles?: string[];
}

const ALLOWED_METHODS = ['list', 'read', 'create', 'update', 'delete'] as const;

export class CreateContentTypeDto {
  @ApiProperty({ example: 'blog' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Blog Posts',
    description: 'Human-readable label shown in the admin UI. The snake_case key is still derived from `name`.',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({
    type: [FieldDto],
    example: [
      { name: 'title', type: 'text' },
      { name: 'content', type: 'richtext' },
      { name: 'thumbnail', type: 'image' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  schema: FieldDto[];

  @ApiPropertyOptional({
    example: ['list', 'read', 'create', 'update', 'delete'],
    description: 'Which API endpoints are enabled. Omit or null = all enabled.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(ALLOWED_METHODS, { each: true })
  @ArrayUnique()
  allowedMethods?: string[];

  @ApiPropertyOptional({
    example: 'https://site.example/api/draft?token={token}&slug={slug}&locale={locale}',
    description: 'Live preview page for the entry editor. {slug}, {locale} and {token} (a 1-hour preview token) are filled in. Empty or null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PREVIEW_URL_MAX_LENGTH)
  @Matches(PREVIEW_URL_PATTERN, { message: 'previewUrl must be an http(s) URL template' })
  previewUrl?: string | null;
}
