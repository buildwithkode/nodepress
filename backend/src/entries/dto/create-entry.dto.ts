import { IsString, IsNotEmpty, IsInt, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEntryDto {
  @ApiProperty({ example: 1, description: 'ID of the content type this entry belongs to' })
  @IsInt()
  contentTypeId: number;

  @ApiProperty({ example: 'my-first-post', description: 'URL-friendly unique identifier within the content type' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({
    example: { title: 'My Post', content: 'Hello world', thumbnail: 'https://example.com/img.jpg' },
    description: 'Entry content — shape defined by the content type schema',
  })
  @IsObject()
  data: Record<string, any>;
}
