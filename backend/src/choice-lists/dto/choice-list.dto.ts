import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// `choices` items are checked by validateChoices() (choice-list.util.ts), which
// reports every problem with its index.

export class CreateChoiceListDto {
  @ApiProperty({ example: 'gender', description: 'Normalized to snake_case' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Gender' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ example: 'Used by the people and customer types' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: '1–1000 choices; values unique, non-empty, ≤ 200 characters; label optional',
    example: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other' }],
  })
  @IsArray()
  choices: Array<{ value: string; label?: string } | string>;
}

export class UpdateChoiceListDto {
  @ApiPropertyOptional({ example: 'gender' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Gender' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: [{ value: 'female', label: 'Female' }] })
  @IsOptional()
  @IsArray()
  choices?: Array<{ value: string; label?: string } | string>;
}
