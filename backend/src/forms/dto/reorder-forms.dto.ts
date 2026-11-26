import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class ReorderFormsDto {
  @ApiProperty({ example: [3, 1, 2], description: 'Every form id, in the new order' })
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}
