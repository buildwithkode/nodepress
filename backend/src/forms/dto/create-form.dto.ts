import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFormDto {
  @ApiProperty({ example: 'Contact Us' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'contact-us',
    description: 'URL-safe slug used in the public submit endpoint: POST /api/submit/:slug',
  })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({
    example: [
      { name: 'full_name', type: 'text',     label: 'Full Name', required: true },
      { name: 'email',     type: 'email',    label: 'Email',     required: true },
      { name: 'message',   type: 'textarea', label: 'Message',   required: true },
    ],
    description: 'Array of FormField definitions',
  })
  @IsArray()
  fields: Record<string, unknown>[];

  @ApiPropertyOptional({
    example: [
      { type: 'email', to: 'admin@example.com', subject: 'New message from {{full_name}}' },
    ],
    description: 'Array of ActionDef definitions (email | webhook)',
  })
  @IsOptional()
  @IsArray()
  actions?: Record<string, unknown>[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
