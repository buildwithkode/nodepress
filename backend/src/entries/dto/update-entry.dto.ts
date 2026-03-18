import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEntryDto {
  @ApiPropertyOptional({ example: 'updated-slug' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: { title: 'Updated Title', content: 'New content' } })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
