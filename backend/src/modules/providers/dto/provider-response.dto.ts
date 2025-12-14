import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class ProviderConfigResponseDto {
  @ApiProperty({ example: 'clx123abc456' })
  id!: string;

  @ApiProperty({ example: 'google', enum: ['google', 'microsoft', 'generic'] })
  providerType!: string;

  @ApiProperty({ example: 'user@gmail.com' })
  email!: string;

  @ApiProperty({ example: 'Work Gmail', required: false })
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Work',
    description: 'Free-form purpose/category of this email account (e.g., Work, Personal, Legal, Kork, etc.)',
  })
  scope?: string;

  @ApiProperty({ example: true })
  supportsEmail!: boolean;

  @ApiProperty({ example: true })
  supportsCalendar!: boolean;

  @ApiProperty({ example: false })
  supportsContacts!: boolean;

  @ApiProperty({ example: false })
  isDefault!: boolean;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-10-29T10:00:00Z', required: false })
  lastSyncedAt?: Date;

  @ApiProperty({ example: '2025-10-29T09:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-10-29T10:30:00Z' })
  updatedAt!: Date;
}

/**
 * DTO for updating provider settings (displayName, scope, isDefault).
 * Scope is free-form text - users can put whatever they want (Work, Personal, Legal, Kork, etc.)
 */
export class UpdateProviderDto {
  @ApiPropertyOptional({
    example: 'Work Gmail',
    description: 'Custom display name for this provider',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Work',
    description: 'Free-form purpose/category (e.g., Work, Personal, Legal, Info, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  scope?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Set this provider as the default',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class OAuthUrlResponseDto {
  @ApiProperty({
    example: 'https://accounts.google.com/o/oauth2/v2/auth?...',
    description: 'OAuth2 authorization URL to redirect the user to'
  })
  authUrl!: string;

  @ApiProperty({
    example: 'state_random_string_123',
    description: 'State parameter for CSRF protection'
  })
  state!: string;
}

export class ProviderTestConnectionDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Connection successful', required: false })
  message?: string;

  @ApiProperty({
    example: { imapConnected: true, smtpConnected: true, caldavConnected: false },
    required: false
  })
  details?: Record<string, any>;
}
