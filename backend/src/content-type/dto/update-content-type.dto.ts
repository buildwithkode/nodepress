import { IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FieldDto } from './create-content-type.dto';

export class UpdateContentTypeDto {
  @ApiPropertyOptional({ example: 'article' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [FieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  schema?: FieldDto[];
}
