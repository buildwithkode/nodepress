import {
  IsString, IsNotEmpty, IsInt, IsObject,
  IsOptional, IsIn, IsBoolean, IsDateString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ENTRY_STATUSES = ['draft', 'published', 'archived'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export class SeoDto {
  @ApiPropertyOptional({ example: 'Custom SEO Title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'A short description for search engines.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/og-image.jpg' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: false, description: 'Set true to add noindex meta tag' })
  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;
}

export class CreateEntryDto {
  @ApiProperty({ example: 1, description: 'ID of the content type this entry belongs to' })
  @IsInt()
  contentTypeId: number;

  @ApiProperty({ example: 'my-first-post', description: 'URL-friendly unique identifier within the content type' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({
    example: 'published',
    enum: ENTRY_STATUSES,
    description: 'Entry visibility status. Defaults to "published".',
  })
  @IsOptional()
  @IsIn(ENTRY_STATUSES)
  status?: EntryStatus;

  @ApiProperty({
    example: { title: 'My Post', content: 'Hello world' },
    description: 'Entry content — shape defined by the content type schema',
  })
  @IsObject()
  data: Record<string, any>;

  @ApiPropertyOptional({ description: 'SEO meta overrides (title, description, image, noIndex)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @ApiPropertyOptional({
    example: '2026-04-01T09:00:00.000Z',
    description: 'ISO datetime — entry auto-publishes when this time passes (requires status: draft)',
  })
  @IsOptional()
  @IsDateString()
  publishAt?: string;
}
