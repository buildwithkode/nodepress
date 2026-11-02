import { IsObject, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SubmitFormDto {
  @ApiProperty({
    example: { full_name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' },
    description:
      "Key/value pairs matching the form's field names. With file fields, post multipart/form-data: " +
      '`data` as a JSON string, and each file under its field name.',
  })
  // A multipart submission (with files) sends `data` as a JSON string.
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'XXXX.DUMMY.TOKEN',
    description:
      'Captcha token from the client-side widget ' +
      '(cf-turnstile-response / h-captcha-response / g-recaptcha-response). ' +
      'Required when the form has captchaEnabled=true and CAPTCHA_PROVIDER is configured.',
  })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
