import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FieldDto {
  @ApiProperty({ example: 'title' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'text',
    enum: ['text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'image', 'repeater', 'flexible'],
  })
  @IsString()
  @IsIn(['text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'image', 'repeater', 'flexible'])
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
    description: 'Type-specific config — subFields for repeater, layouts for flexible, choices for select, min/max for number/text',
    example: { subFields: [{ name: 'image', type: 'image' }] },
  })
  @IsOptional()
  options?: any;
}

export class CreateContentTypeDto {
  @ApiProperty({ example: 'blog' })
  @IsString()
  @IsNotEmpty()
  name: string;

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
}
