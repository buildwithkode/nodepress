import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitFormDto {
  @ApiProperty({
    example: { full_name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' },
    description: 'Key/value pairs matching the form\'s field names',
  })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;
}
