import { IsString, Length, IsOptional, IsBoolean, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for TOTP setup request
 */
export class TotpSetupDto {
  @ApiPropertyOptional({ description: 'Tenant slug for multi-tenant support' })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

/**
 * DTO for TOTP verification (activation and login)
 */
export class TotpVerifyDto {
  @ApiProperty({ description: 'TOTP code from authenticator app', example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'TOTP code must contain only digits' })
  code!: string;
}

/**
 * DTO for backup code verification
 */
export class BackupCodeVerifyDto {
  @ApiProperty({ description: 'Backup code in XXXX-XXXX format', example: 'ABCD-EF12' })
  @IsString()
  @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, { message: 'Invalid backup code format. Expected: XXXX-XXXX' })
  code!: string;
}

/**
 * DTO for MFA challenge during login
 */
export class MfaChallengeDto {
  @ApiProperty({ description: 'MFA token received from login response' })
  @IsString()
  mfaToken!: string;

  @ApiProperty({ description: 'MFA method to use', enum: ['totp', 'backup', 'email'] })
  @IsString()
  @Matches(/^(totp|backup|email)$/, { message: 'Invalid MFA method' })
  method!: 'totp' | 'backup' | 'email';

  @ApiProperty({ description: 'Verification code' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ description: 'Remember this device for 30 days' })
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}

/**
 * DTO for revoking a specific trusted device
 */
export class RevokeDeviceDto {
  @ApiProperty({ description: 'Device ID to revoke' })
  @IsString()
  deviceId!: string;
}

/**
 * Response DTOs
 */
export class TotpSetupResponseDto {
  @ApiProperty({ description: 'Base32 encoded secret for manual entry' })
  secret!: string;

  @ApiProperty({ description: 'QR code as base64 data URL' })
  qrCodeDataUrl!: string;

  @ApiProperty({ description: 'otpauth:// URI for QR code' })
  otpauthUrl!: string;
}

export class BackupCodesResponseDto {
  @ApiProperty({ description: 'List of backup codes in XXXX-XXXX format', type: [String] })
  codes!: string[];

  @ApiProperty({ description: 'Warning message about storing codes safely' })
  warning!: string;
}

export class TrustedDeviceResponseDto {
  @ApiProperty({ description: 'Device ID' })
  id!: string;

  @ApiProperty({ description: 'Device name (e.g., Chrome on Windows)' })
  deviceName!: string;

  @ApiProperty({ description: 'Approximate location', required: false })
  location?: string;

  @ApiProperty({ description: 'Whether this is the current device' })
  isCurrent!: boolean;

  @ApiProperty({ description: 'Last used timestamp' })
  lastUsedAt!: Date;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;
}

export class MfaStatusResponseDto {
  @ApiProperty({ description: 'Whether TOTP is enabled' })
  totpEnabled!: boolean;

  @ApiProperty({ description: 'Number of remaining backup codes' })
  backupCodesRemaining!: number;

  @ApiProperty({ description: 'Number of trusted devices' })
  trustedDevicesCount!: number;
}

export class MfaChallengeResponseDto {
  @ApiProperty({ description: 'Whether MFA verification succeeded' })
  success!: boolean;

  @ApiProperty({ description: 'Access token if successful' })
  accessToken?: string;

  @ApiProperty({ description: 'Refresh token if successful' })
  refreshToken?: string;

  @ApiProperty({ description: 'Trusted device token if device trust was requested' })
  deviceToken?: string;

  @ApiProperty({ description: 'Error reason if failed' })
  reason?: string;
}
