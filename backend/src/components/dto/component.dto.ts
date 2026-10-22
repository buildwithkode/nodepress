import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldDto } from '../../content-type/dto/create-content-type.dto';
import { FieldMigrationsDto } from '../../content-type/dto/update-content-type.dto';

export class CreateComponentDto {
  @ApiProperty({ example: 'seo', description: 'Normalized to snake_case' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'SEO' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'Meta title and description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    type: [FieldDto],
    description: 'Simple fields only (no repeater/flexible/group, no reverse relations)',
    example: [{ name: 'meta_title', type: 'text' }, { name: 'meta_description', type: 'textarea' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  fields: FieldDto[];
}

export class UpdateComponentDto {
  @ApiPropertyOptional({ example: 'seo' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'SEO' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [FieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  fields?: FieldDto[];

  @ApiPropertyOptional({
    type: FieldMigrationsDto,
    description: 'Move existing entry data in every content type using the component — field names are the component\'s own (e.g. renames: [{ from: "title", to: "meta_title" }])',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMigrationsDto)
  fieldMigrations?: FieldMigrationsDto;
}
