import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const RELEASE_ACTIONS = ['publish', 'unpublish', 'archive'] as const;
export type ReleaseAction = (typeof RELEASE_ACTIONS)[number];

export class CreateReleaseDto {
  @ApiProperty({ example: 'Spring launch' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateReleaseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AddReleaseItemsDto {
  @ApiProperty({ type: [Number], example: [12, 13] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  entryIds: number[];

  @ApiPropertyOptional({ enum: RELEASE_ACTIONS, default: 'publish' })
  @IsOptional()
  @IsIn(RELEASE_ACTIONS as unknown as string[])
  action?: ReleaseAction;
}

export class ScheduleReleaseDto {
  @ApiProperty({ nullable: true, example: '2026-11-01T09:00:00.000Z', description: 'null unschedules' })
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  scheduledAt: string | null;
}
