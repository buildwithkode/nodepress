import { IsString, IsUrl, IsArray, IsOptional, IsBoolean, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'Notify deploy server' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ description: 'HMAC-SHA256 signing secret' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiProperty({
    example: ['entry.created', 'entry.updated'],
    description: 'Event names — use ["*"] to receive all events',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
