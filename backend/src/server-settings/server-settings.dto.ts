import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class MailSettingsDto {
  /** false turns email off (clears the saved settings). */
  @IsBoolean()
  enabled: boolean;

  @ValidateIf((o) => o.enabled)
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;

  /** Omit (or send '') to keep the saved password. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  pass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;
}

/** `to`, plus unsaved settings to try — leave them out to test the saved ones. */
export class MailTestDto {
  @IsEmail()
  to: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  pass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;
}

export class StorageSettingsDto {
  @IsIn(['local', 's3'])
  driver: 'local' | 's3';

  @ValidateIf((o) => o.driver === 's3')
  @IsString()
  @MaxLength(255)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @ValidateIf((o) => o.driver === 's3')
  @IsString()
  @MaxLength(255)
  accessKey?: string;

  /** Omit (or send '') to keep the saved secret. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  secretKey?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.endpoint)
  @IsUrl({ require_tld: false })
  endpoint?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.publicUrl)
  @IsUrl({ require_tld: false })
  publicUrl?: string;
}
