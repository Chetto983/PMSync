import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectMicrosoftProviderDto {
  @ApiProperty({
    description: 'Email address to connect (optional, will be obtained from OAuth2 if not provided)',
    example: 'user@outlook.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'OAuth2 authorization code from Microsoft',
    example: 'M.R3_BAY...',
  })
  @IsString()
  @IsNotEmpty()
  authorizationCode!: string;

  @ApiProperty({
    description: 'OAuth state parameter for CSRF protection',
    example: 'abc123...',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    description: 'Enable calendar sync',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  supportsCalendar?: boolean = true;

  @ApiProperty({
    description: 'Enable contacts sync',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  supportsContacts?: boolean = true;

  @ApiProperty({
    description: 'Set as default provider',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;
}

export class MicrosoftOAuthUrlDto {
  @ApiProperty({
    description: 'Scopes to request from Microsoft',
    example: ['Mail.Read', 'Calendars.ReadWrite'],
  })
  @IsOptional()
  scopes?: string[];
}
