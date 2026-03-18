import { IsString, IsNotEmpty, IsIn, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApiKeyPermissionsDto {
  @ApiProperty({ enum: ['read', 'write', 'all'], description: 'Access level' })
  @IsIn(['read', 'write', 'all'])
  access: 'read' | 'write' | 'all';

  @ApiProperty({
    description: 'Content types this key can access — use ["*"] for all',
    example: ['blog', 'pages'],
  })
  @IsArray()
  @IsString({ each: true })
  contentTypes: string[];
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My Mobile App' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ type: ApiKeyPermissionsDto })
  @ValidateNested()
  @Type(() => ApiKeyPermissionsDto)
  permissions: ApiKeyPermissionsDto;
}
