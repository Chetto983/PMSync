import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectGoogleProviderDto {
  @ApiProperty({
    description: 'Email address to connect (optional, will be obtained from OAuth2 if not provided)',
    example: 'user@gmail.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'OAuth2 authorization code from Google',
    example: '4/0AX4XfWh...',
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

export class GoogleOAuthUrlDto {
  @ApiProperty({
    description: 'Scopes to request from Google',
    example: ['email', 'calendar'],
  })
  @IsOptional()
  scopes?: string[];
}
