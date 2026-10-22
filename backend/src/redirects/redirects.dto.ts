import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REDIRECT_MAX_LENGTH, REDIRECT_STATUS_CODES } from './redirect-path';

export class CreateRedirectDto {
  @ApiProperty({ example: '/old-page', description: 'Path on the site (lowercased; a query string is matched only when given)' })
  @IsString()
  @MaxLength(REDIRECT_MAX_LENGTH)
  from: string;

  @ApiPropertyOptional({ example: '/new-page', description: 'A path or an http(s) URL; empty for 410' })
  @IsOptional()
  @IsString()
  @MaxLength(REDIRECT_MAX_LENGTH)
  to?: string;

  @ApiPropertyOptional({ enum: REDIRECT_STATUS_CODES, default: 301 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...REDIRECT_STATUS_CODES])
  statusCode?: number;
}

export class UpdateRedirectDto {
  @ApiPropertyOptional({ example: '/old-page' })
  @IsOptional()
  @IsString()
  @MaxLength(REDIRECT_MAX_LENGTH)
  from?: string;

  @ApiPropertyOptional({ example: '/new-page' })
  @IsOptional()
  @IsString()
  @MaxLength(REDIRECT_MAX_LENGTH)
  to?: string;

  @ApiPropertyOptional({ enum: REDIRECT_STATUS_CODES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...REDIRECT_STATUS_CODES])
  statusCode?: number;
}

export class ImportRedirectsDto {
  @ApiProperty({ example: 'from,to,status\n/old,/new,301\n/gone,,410' })
  @IsString()
  @MaxLength(1_000_000)
  csv: string;

  @ApiPropertyOptional({ description: 'Only report what would change' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
