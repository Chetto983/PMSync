import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min, Max, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * DTO for testing IMAP/SMTP credentials before creating a provider
 */
export class TestImapCredentialsDto {
  @ApiProperty({
    description: 'IMAP server host',
    example: 'imap.example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapHost!: string;

  @ApiProperty({
    description: 'IMAP server port',
    example: 993,
    default: 993,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  imapPort?: number = 993;

  @ApiProperty({
    description: 'IMAP username',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapUsername!: string;

  @ApiProperty({
    description: 'IMAP password',
    example: 'password123',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapPassword!: string;

  @ApiProperty({
    description: 'Use TLS for IMAP',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  imapUseTls?: boolean = true;

  // Optional SMTP testing
  @ApiProperty({
    description: 'SMTP server host (optional)',
    example: 'smtp.example.com',
    required: false,
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpHost?: string;

  @ApiProperty({
    description: 'SMTP server port',
    example: 587,
    default: 587,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  smtpPort?: number = 587;

  @ApiProperty({
    description: 'SMTP username (defaults to IMAP username)',
    example: 'user@example.com',
    required: false,
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpUsername?: string;

  @ApiProperty({
    description: 'SMTP password (defaults to IMAP password)',
    example: 'password123',
    required: false,
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpPassword?: string;

  @ApiProperty({
    description: 'Use TLS for SMTP',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  smtpUseTls?: boolean = true;
}

export class ConnectGenericProviderDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Display name',
    example: 'John Doe',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  displayName?: string;

  // IMAP Configuration
  @ApiProperty({
    description: 'IMAP server host',
    example: 'imap.example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapHost!: string;

  @ApiProperty({
    description: 'IMAP server port',
    example: 993,
    default: 993,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  imapPort?: number = 993;

  @ApiProperty({
    description: 'IMAP username',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapUsername!: string;

  @ApiProperty({
    description: 'IMAP password',
    example: 'password123',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  imapPassword!: string;

  @ApiProperty({
    description: 'Use TLS for IMAP',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  imapUseTls?: boolean = true;

  // SMTP Configuration
  @ApiProperty({
    description: 'SMTP server host',
    example: 'smtp.example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpHost?: string;

  @ApiProperty({
    description: 'SMTP server port',
    example: 587,
    default: 587,
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  smtpPort?: number = 587;

  @ApiProperty({
    description: 'SMTP username',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpUsername?: string;

  @ApiProperty({
    description: 'SMTP password',
    example: 'password123',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  smtpPassword?: string;

  @ApiProperty({
    description: 'Use TLS for SMTP',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  smtpUseTls?: boolean = true;

  // CalDAV Configuration
  @ApiProperty({
    description: 'CalDAV server URL',
    example: 'https://caldav.example.com/calendars/user',
    required: false,
  })
  @Transform(({ value }) => value?.trim())
  @ValidateIf((o) => o.caldavUrl && o.caldavUrl.length > 0)
  @IsUrl()
  @IsOptional()
  caldavUrl?: string;

  @ApiProperty({
    description: 'CalDAV username',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  caldavUsername?: string;

  @ApiProperty({
    description: 'CalDAV password',
    example: 'password123',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  caldavPassword?: string;

  // CardDAV Configuration
  @ApiProperty({
    description: 'CardDAV server URL',
    example: 'https://carddav.example.com/contacts/user',
    required: false,
  })
  @Transform(({ value }) => value?.trim())
  @ValidateIf((o) => o.carddavUrl && o.carddavUrl.length > 0)
  @IsUrl()
  @IsOptional()
  carddavUrl?: string;

  @ApiProperty({
    description: 'CardDAV username',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  carddavUsername?: string;

  @ApiProperty({
    description: 'CardDAV password',
    example: 'password123',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  carddavPassword?: string;

  // General settings
  @ApiProperty({
    description: 'Enable calendar sync',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  supportsCalendar?: boolean = false;

  @ApiProperty({
    description: 'Enable contacts sync',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  supportsContacts?: boolean = false;

  @ApiProperty({
    description: 'Set as default provider',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;
}
