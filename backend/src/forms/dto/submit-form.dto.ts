import { IsObject, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitFormDto {
  @ApiProperty({
    example: { full_name: 'Jane Doe', email: 'jane@example.com', message: 'Hello!' },
    description: "Key/value pairs matching the form's field names",
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
