import { IsArray, IsString, ArrayMinSize, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'publish'] as const;
export type PermissionAction = typeof ALL_ACTIONS[number];

export class UpsertPermissionDto {
  @ApiProperty({
    type: [String],
    example: ['create', 'read', 'update'],
    description: 'Allowed actions. Must be a subset of: create, read, update, delete, publish',
  })
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_ACTIONS as unknown as string[], { each: true })
  @ArrayMinSize(0)
  actions: string[];
}
