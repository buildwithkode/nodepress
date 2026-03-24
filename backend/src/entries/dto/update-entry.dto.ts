import {
  IsString, IsObject, IsOptional, IsIn, IsDateString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ENTRY_STATUSES, EntryStatus, SeoDto } from './create-entry.dto';

export class UpdateEntryDto {
  @ApiPropertyOptional({ example: 'updated-slug' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'draft', enum: ENTRY_STATUSES })
  @IsOptional()
  @IsIn(ENTRY_STATUSES)
  status?: EntryStatus;

  @ApiPropertyOptional({ example: { title: 'Updated Title' } })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'SEO meta overrides (title, description, image, noIndex)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @ApiPropertyOptional({
    example: '2026-04-01T09:00:00.000Z',
    description: 'ISO datetime — pass null to clear the scheduled publish time',
  })
  @IsOptional()
  @IsDateString()
  publishAt?: string | null;
}
