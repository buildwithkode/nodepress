import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SettingItemDto {
  @ApiProperty({ example: 'site_name' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'My Website' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ example: 'Site Name' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'text', enum: ['text', 'textarea', 'url', 'number', 'boolean'] })
  @IsOptional()
  @IsIn(['text', 'textarea', 'url', 'number', 'boolean'])
  type?: string;

  @ApiPropertyOptional({ example: 'General' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sort?: number;
}

export class UpsertSettingsDto {
  @ApiProperty({ type: [SettingItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}
