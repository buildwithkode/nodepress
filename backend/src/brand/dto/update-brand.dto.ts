import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brandName?: string;

  // Empty string clears the logo; otherwise a URL (relative /uploads/... or absolute).
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  brandLogoUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'brandColor must be a hex colour like #4f46e5',
  })
  brandColor?: string;

  // Theme overrides — a hex colour, or '' to reset to the built-in default.
  @IsOptional()
  @IsString()
  @Matches(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/, {
    message: 'buttonColor must be a hex colour like #4f46e5 (or empty to reset)',
  })
  buttonColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/, {
    message: 'inputColor must be a hex colour like #4f46e5 (or empty to reset)',
  })
  inputColor?: string;
}
