import { IsString, IsNotEmpty, IsArray, ValidateNested, IsIn, IsOptional } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'Extra config — subFields for repeater, layouts for flexible, options for select',
    example: { subFields: [{ name: 'label', type: 'text' }] },
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
