import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TenantGuard } from '../guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { TotpService } from '../services/totp.service';
import { BackupCodesService } from '../services/backup-codes.service';
import { TrustedDeviceService } from '../services/trusted-device.service';
import { WebAuthnService } from '../services/webauthn.service';
import { Request as ExpressRequest } from 'express';
import {
  TotpVerifyDto,
  BackupCodeVerifyDto,
  TotpSetupResponseDto,
  BackupCodesResponseDto,
  TrustedDeviceResponseDto,
  MfaStatusResponseDto,
  WebAuthnRegistrationVerifyDto,
  WebAuthnAuthenticationVerifyDto,
  WebAuthnUpdateNameDto,
  WebAuthnCredentialResponseDto,
} from '../dtos/mfa.dto';

/**
 * MFA Controller - Multi-Factor Authentication endpoints
 *
 * Provides API for:
 * - TOTP (Authenticator App) setup and verification
 * - Backup codes generation and usage
 * - Trusted device management
 * - WebAuthn/Passkey registration and authentication
 *
 * @see MFA_ENHANCEMENT_ROADMAP.md Phase 5 & 8
 */
@ApiTags('MFA')
@ApiBearerAuth()
@Controller('auth/mfa')
@UseGuards(TenantGuard)
export class MfaController {
  constructor(
    private readonly totpService: TotpService,
    private readonly backupCodesService: BackupCodesService,
    private readonly trustedDeviceService: TrustedDeviceService,
    private readonly webauthnService: WebAuthnService,
  ) {}

  // ==================== STATUS ====================

  /**
   * Get MFA status for current user
   * GET /auth/mfa/status
   */
  @Get('status')
  @ApiOperation({ summary: 'Get MFA status for current user' })
  @ApiResponse({ status: 200, description: 'MFA status', type: MfaStatusResponseDto })
  async getStatus(@Request() req: AuthenticatedRequest): Promise<MfaStatusResponseDto & { webauthnEnabled: boolean; webauthnCredentialsCount: number }> {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;

    const [totpEnabled, backupCodesRemaining, trustedDevicesCount, webauthnCredentials] = await Promise.all([
      this.totpService.isEnabled(userId),
      this.backupCodesService.getRemainingCount(tenantId, userId),
      this.trustedDeviceService.listDevices(tenantId, userId).then((devices) => devices.length),
      this.webauthnService.listCredentials(userId),
    ]);

    return {
      totpEnabled,
      backupCodesRemaining,
      trustedDevicesCount,
      webauthnEnabled: webauthnCredentials.length > 0,
      webauthnCredentialsCount: webauthnCredentials.length,
    };
  }

  // ==================== TOTP ====================

  /**
   * Generate TOTP secret and QR code for setup
   * POST /auth/mfa/totp/setup
   */
  @Post('totp/setup')
  @ApiOperation({ summary: 'Generate TOTP secret and QR code for authenticator app setup' })
  @ApiResponse({ status: 201, description: 'TOTP setup data', type: TotpSetupResponseDto })
  @ApiResponse({ status: 400, description: 'TOTP already enabled' })
  async setupTotp(@Request() req: AuthenticatedRequest): Promise<TotpSetupResponseDto> {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;
    const email = req.user.email;

    // Check if already enabled
    const isEnabled = await this.totpService.isEnabled(userId);
    if (isEnabled) {
      throw new BadRequestException('TOTP is already enabled. Disable it first to set up again.');
    }

    return this.totpService.generateSecret(tenantId, userId, email);
  }

  /**
   * Verify TOTP code and activate
   * POST /auth/mfa/totp/verify
   */
  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code and activate authenticator app' })
  @ApiResponse({ status: 200, description: 'TOTP activated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or not set up' })
  async verifyTotp(
    @Request() req: AuthenticatedRequest,
    @Body() body: TotpVerifyDto,
  ): Promise<{ success: boolean; message: string; backupCodes?: string[] }> {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;

    const result = await this.totpService.verifyAndActivate(userId, body.code);

    if (!result.success) {
      if (result.reason === 'not_setup') {
        throw new BadRequestException('TOTP not set up. Call /auth/mfa/totp/setup first.');
      }
      throw new BadRequestException('Invalid TOTP code. Please try again.');
    }

    // Generate backup codes on first activation
    const backupCodes = await this.backupCodesService.generate(tenantId, userId);

    return {
      success: true,
      message: 'TOTP enabled successfully. Save your backup codes!',
      backupCodes,
    };
  }

  /**
   * Check if TOTP is enabled
   * GET /auth/mfa/totp/status
   */
  @Get('totp/status')
  @ApiOperation({ summary: 'Check if TOTP is enabled' })
  @ApiResponse({ status: 200, description: 'TOTP status' })
  async getTotpStatus(@Request() req: AuthenticatedRequest): Promise<{ enabled: boolean }> {
    const enabled = await this.totpService.isEnabled(req.user.userId);
    return { enabled };
  }

  /**
   * Disable TOTP
   * DELETE /auth/mfa/totp
   */
  @Delete('totp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Disable TOTP (requires code verification)' })
  @ApiResponse({ status: 200, description: 'TOTP disabled' })
  @ApiResponse({ status: 400, description: 'Invalid code' })
  async disableTotp(
    @Request() req: AuthenticatedRequest,
    @Body() body: TotpVerifyDto,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.userId;

    // Verify code before disabling
    const result = await this.totpService.verifyCode(userId, body.code);
    if (!result.success) {
      throw new BadRequestException('Invalid TOTP code. Cannot disable.');
    }

    await this.totpService.disable(userId);

    // Also delete backup codes when disabling MFA
    await this.backupCodesService.deleteAll(req.user.tenantId, userId);

    return {
      success: true,
      message: 'TOTP disabled. Backup codes have been deleted.',
    };
  }

  // ==================== BACKUP CODES ====================

  /**
   * Generate new backup codes
   * POST /auth/mfa/backup/generate
   */
  @Post('backup/generate')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate new backup codes (invalidates existing)' })
  @ApiResponse({ status: 201, description: 'New backup codes', type: BackupCodesResponseDto })
  @ApiResponse({ status: 400, description: 'TOTP not enabled' })
  async generateBackupCodes(
    @Request() req: AuthenticatedRequest,
  ): Promise<BackupCodesResponseDto> {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;

    // Verify TOTP is enabled first
    const totpEnabled = await this.totpService.isEnabled(userId);
    if (!totpEnabled) {
      throw new BadRequestException('Enable TOTP first before generating backup codes.');
    }

    const codes = await this.backupCodesService.generate(tenantId, userId);

    return {
      codes,
      warning: 'Store these codes safely. Each code can only be used once. This will invalidate any previous codes.',
    };
  }

  /**
   * Get remaining backup codes count
   * GET /auth/mfa/backup/count
   */
  @Get('backup/count')
  @ApiOperation({ summary: 'Get remaining backup codes count' })
  @ApiResponse({ status: 200, description: 'Remaining count' })
  async getBackupCodesCount(@Request() req: AuthenticatedRequest): Promise<{ remaining: number }> {
    const remaining = await this.backupCodesService.getRemainingCount(req.user.tenantId, req.user.userId);
    return { remaining };
  }

  /**
   * Verify a backup code (for testing, not login)
   * POST /auth/mfa/backup/verify
   */
  @Post('backup/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify a backup code (marks as used)' })
  @ApiResponse({ status: 200, description: 'Code verified' })
  @ApiResponse({ status: 400, description: 'Invalid or used code' })
  async verifyBackupCode(
    @Request() req: AuthenticatedRequest,
    @Body() body: BackupCodeVerifyDto,
  ): Promise<{ success: boolean; remaining: number }> {
    const userId = req.user.userId;
    const tenantId = req.user.tenantId;

    const result = await this.backupCodesService.verify(tenantId, userId, body.code);

    if (!result.success) {
      throw new BadRequestException(
        result.reason === 'already_used'
          ? 'This backup code has already been used.'
          : 'Invalid backup code.',
      );
    }

    const remaining = await this.backupCodesService.getRemainingCount(tenantId, userId);

    return {
      success: true,
      remaining,
    };
  }

  // ==================== TRUSTED DEVICES ====================

  /**
   * List trusted devices
   * GET /auth/mfa/devices
   */
  @Get('devices')
  @ApiOperation({ summary: 'List all trusted devices' })
  @ApiResponse({ status: 200, description: 'List of trusted devices', type: [TrustedDeviceResponseDto] })
  async listDevices(
    @Request() req: AuthenticatedRequest,
    @Req() expressReq: ExpressRequest,
  ): Promise<TrustedDeviceResponseDto[]> {
    const userId = req.user.userId;
    const currentToken = this.extractDeviceToken(expressReq);

    const devices = await this.trustedDeviceService.listDevices(
      req.user.tenantId,
      userId,
      currentToken,
    );

    // Map to response DTO
    return devices.map((device) => ({
      id: device.id,
      deviceName: device.deviceName,
      location: device.location,
      isCurrent: device.isCurrent,
      lastUsedAt: device.lastUsedAt,
      createdAt: device.createdAt,
    }));
  }

  /**
   * Revoke a specific trusted device
   * DELETE /auth/mfa/devices/:id
   */
  @Delete('devices/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a specific trusted device' })
  @ApiParam({ name: 'id', description: 'Device ID to revoke' })
  @ApiResponse({ status: 200, description: 'Device revoked' })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async revokeDevice(
    @Request() req: AuthenticatedRequest,
    @Param('id') deviceId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.trustedDeviceService.revokeDevice(req.user.tenantId, req.user.userId, deviceId);
    return {
      success: true,
      message: 'Device revoked successfully.',
    };
  }

  /**
   * Revoke all trusted devices
   * DELETE /auth/mfa/devices
   */
  @Delete('devices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all trusted devices' })
  @ApiResponse({ status: 200, description: 'All devices revoked' })
  async revokeAllDevices(@Request() req: AuthenticatedRequest): Promise<{ success: boolean; message: string }> {
    await this.trustedDeviceService.revokeAllDevices(req.user.tenantId, req.user.userId);
    return {
      success: true,
      message: 'All trusted devices revoked.',
    };
  }

  /**
   * Trust current device (adds to trusted devices)
   * POST /auth/mfa/devices/trust
   */
  @Post('devices/trust')
  @ApiOperation({ summary: 'Trust the current device for 30 days' })
  @ApiResponse({ status: 201, description: 'Device trusted' })
  async trustCurrentDevice(
    @Request() req: AuthenticatedRequest,
    @Req() expressReq: ExpressRequest,
  ): Promise<{ deviceToken: string; expiresAt: Date }> {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;
    const token = await this.trustedDeviceService.trustDevice(tenantId, userId, expressReq);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return {
      deviceToken: token,
      expiresAt,
    };
  }

  // ==================== WEBAUTHN / PASSKEYS ====================

  /**
   * Generate WebAuthn registration options
   * POST /auth/mfa/webauthn/register/options
   */
  @Post('webauthn/register/options')
  @ApiOperation({ summary: 'Generate WebAuthn registration options for passkey setup' })
  @ApiResponse({ status: 201, description: 'Registration options for browser WebAuthn API' })
  async getWebAuthnRegistrationOptions(@Request() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const email = req.user.email;

    const options = await this.webauthnService.generateRegistrationOptions(userId, email);
    return options;
  }

  /**
   * Verify WebAuthn registration response
   * POST /auth/mfa/webauthn/register/verify
   */
  @Post('webauthn/register/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WebAuthn registration and save passkey' })
  @ApiResponse({ status: 200, description: 'Passkey registered successfully' })
  @ApiResponse({ status: 400, description: 'Registration verification failed' })
  async verifyWebAuthnRegistration(
    @Request() req: AuthenticatedRequest,
    @Body() body: WebAuthnRegistrationVerifyDto,
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    const result = await this.webauthnService.verifyRegistration(
      tenantId,
      userId,
      body.response as unknown as Parameters<typeof this.webauthnService.verifyRegistration>[2],
      body.deviceName,
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Registration failed');
    }

    return result;
  }

  /**
   * List WebAuthn credentials
   * GET /auth/mfa/webauthn/credentials
   */
  @Get('webauthn/credentials')
  @ApiOperation({ summary: 'List all registered passkeys' })
  @ApiResponse({ status: 200, description: 'List of passkeys', type: [WebAuthnCredentialResponseDto] })
  async listWebAuthnCredentials(@Request() req: AuthenticatedRequest): Promise<WebAuthnCredentialResponseDto[]> {
    const credentials = await this.webauthnService.listCredentials(req.user.userId);
    return credentials;
  }

  /**
   * Update WebAuthn credential name
   * PATCH /auth/mfa/webauthn/credentials/:id
   */
  @Patch('webauthn/credentials/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update passkey device name' })
  @ApiParam({ name: 'id', description: 'Credential ID' })
  @ApiResponse({ status: 200, description: 'Name updated' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  async updateWebAuthnCredentialName(
    @Request() req: AuthenticatedRequest,
    @Param('id') credentialId: string,
    @Body() body: WebAuthnUpdateNameDto,
  ): Promise<{ success: boolean }> {
    const updated = await this.webauthnService.updateCredentialName(
      req.user.userId,
      credentialId,
      body.deviceName,
    );

    if (!updated) {
      throw new BadRequestException('Credential not found');
    }

    return { success: true };
  }

  /**
   * Delete a WebAuthn credential
   * DELETE /auth/mfa/webauthn/credentials/:id
   */
  @Delete('webauthn/credentials/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a passkey' })
  @ApiParam({ name: 'id', description: 'Credential ID to delete' })
  @ApiResponse({ status: 200, description: 'Passkey deleted' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  async deleteWebAuthnCredential(
    @Request() req: AuthenticatedRequest,
    @Param('id') credentialId: string,
  ): Promise<{ success: boolean; message: string }> {
    const deleted = await this.webauthnService.deleteCredential(req.user.userId, credentialId);

    if (!deleted) {
      throw new BadRequestException('Credential not found');
    }

    return {
      success: true,
      message: 'Passkey deleted successfully.',
    };
  }

  /**
   * Generate WebAuthn authentication options (for passwordless login)
   * POST /auth/mfa/webauthn/authenticate/options
   * Note: This is typically called without authentication for login flow
   */
  @Post('webauthn/authenticate/options')
  @ApiOperation({ summary: 'Generate WebAuthn authentication options' })
  @ApiResponse({ status: 201, description: 'Authentication options for browser WebAuthn API' })
  async getWebAuthnAuthenticationOptions(@Request() req: AuthenticatedRequest) {
    const userId = req.user.userId;

    const { options, sessionId } = await this.webauthnService.generateAuthenticationOptions(userId);
    return { options, sessionId };
  }

  /**
   * Verify WebAuthn authentication response
   * POST /auth/mfa/webauthn/authenticate/verify
   */
  @Post('webauthn/authenticate/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WebAuthn authentication' })
  @ApiResponse({ status: 200, description: 'Authentication verified' })
  @ApiResponse({ status: 400, description: 'Authentication failed' })
  async verifyWebAuthnAuthentication(
    @Request() req: AuthenticatedRequest,
    @Body() body: WebAuthnAuthenticationVerifyDto,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.webauthnService.verifyAuthentication(
      body.response as unknown as Parameters<typeof this.webauthnService.verifyAuthentication>[0],
      body.sessionId,
      req.user.userId,
    );

    if (!result.success) {
      throw new BadRequestException(result.error || 'Authentication failed');
    }

    return { success: true };
  }

  // ==================== HELPERS ====================

  /**
   * Extract device token from cookie or header
   */
  private extractDeviceToken(req: ExpressRequest): string | undefined {
    // Try cookie first
    const cookieToken = req.cookies?.['mfa_device_token'];
    if (cookieToken) return cookieToken;

    // Try header
    const headerToken = req.headers['x-device-token'];
    if (typeof headerToken === 'string') return headerToken;

    return undefined;
  }
}
