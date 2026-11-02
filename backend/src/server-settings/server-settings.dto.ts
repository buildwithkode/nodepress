import { Matches, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';

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

const usesS3Keys = (o: StorageSettingsDto) => o.driver === 's3' || o.driver === 'r2';

export class StorageSettingsDto {
  @IsIn(['local', 's3', 'r2', 'imagekit'])
  driver: 'local' | 's3' | 'r2' | 'imagekit';

  @ValidateIf(usesS3Keys)
  @IsString()
  @MaxLength(255)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @ValidateIf(usesS3Keys)
  @IsString()
  @MaxLength(255)
  accessKey?: string;

  /** The S3/R2 secret key or the ImageKit private key. Omit (or send '') to keep the saved one. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  secretKey?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.endpoint)
  @IsUrl({ require_tld: false })
  endpoint?: string;

  /** R2 only. It becomes part of the API host, so it has to be exactly the 32 hex characters. */
  @ValidateIf((o) => o.driver === 'r2')
  @Matches(/^[a-f0-9]{32}$/i, { message: 'Enter the 32-character Cloudflare account ID' })
  accountId?: string;

  /** Required for R2: its API address doesn't serve files. */
  @ValidateIf((o) => o.driver === 'r2' || !!o.publicUrl)
  @IsUrl({ require_tld: false })
  publicUrl?: string;

  /** ImageKit only: https://ik.imagekit.io/your_id or a custom domain. */
  @ValidateIf((o) => o.driver === 'imagekit')
  @IsUrl({ protocols: ['https'], require_protocol: true })
  urlEndpoint?: string;

  /** ImageKit only: folder inside its media library. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^(?!.*(^|\/)\.{1,2}(\/|$))[\w\-./ ]*$/, { message: 'Use letters, numbers, spaces, - _ . and / in the folder' })
  folder?: string;
}
