import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Req,
  GoneException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyOtpDto } from '../dtos/verify-otp.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { SendOtpDto } from '../dtos/send-otp.dto';
import { MfaChallengeDto, MfaChallengeResponseDto, WebAuthnLoginOptionsDto, WebAuthnLoginVerifyDto } from '../dtos/mfa.dto';
import { Request as ExpressRequest } from 'express';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Register a new user
   * POST /auth/register
   */
  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  /**
   * Send OTP code via email
   * POST /auth/send-otp
   * Rate limited: 5 requests per 60 seconds to prevent OTP spam
   */
  @Post('send-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendOtp(@Body() body: SendOtpDto) {
    return this.authService.sendOtpCode(body.email, body.tenantSlug);
  }

  /**
   * Verify OTP code
   * POST /auth/verify-otp
   * SECURITY: Rate limited to 3 attempts per 60 seconds to prevent brute force
   * 6-digit OTP = 1M combinations, 3/min = too slow to brute force
   */
  @Post('verify-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.verifyOtpCode(body.email, body.code, body.tenantSlug, ipAddress, userAgent);
  }

  /**
   * Login user with email and password
   * POST /auth/login
   * SECURITY: Rate limited to 5 attempts per 60 seconds to prevent credential stuffing
   *
   * MFA Response: If MFA is enabled, returns { mfaRequired: true, mfaToken, availableMethods }
   * Use POST /auth/mfa/verify with mfaToken to complete login
   */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful or MFA required' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() body: LoginDto,
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const deviceToken = req.cookies?.['mfa_device_token'] || req.headers['x-device-token'] as string;
    return this.authService.login(body.email, body.password, body.tenantSlug, ipAddress, userAgent, deviceToken, req);
  }

  /**
   * Verify MFA challenge (TOTP, backup code, or email OTP)
   * POST /auth/mfa/verify
   * SECURITY: Rate limited to 5 attempts per 60 seconds
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify MFA challenge to complete login' })
  @ApiResponse({ status: 200, description: 'MFA verified, login successful', type: MfaChallengeResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid MFA code or token' })
  async verifyMfaChallenge(
    @Body() body: MfaChallengeDto,
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.verifyMfaChallenge(
      body.mfaToken,
      body.method,
      body.code,
      body.trustDevice || false,
      req,
      ipAddress,
      userAgent,
    );
  }

  // ==================== WEBAUTHN / PASSKEY LOGIN ====================

  /**
   * Get WebAuthn login options for passwordless authentication
   * POST /auth/webauthn/login/options
   * Rate limited: 5 requests per 60 seconds
   */
  @Post('webauthn/login/options')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Get WebAuthn authentication options for passkey login' })
  @ApiResponse({ status: 201, description: 'Authentication options for browser WebAuthn API' })
  @ApiResponse({ status: 400, description: 'User not found or no passkeys registered' })
  async getWebAuthnLoginOptions(@Body() body: WebAuthnLoginOptionsDto) {
    return this.authService.getWebAuthnLoginOptions(body.email, body.tenantSlug);
  }

  /**
   * Verify WebAuthn authentication and complete login
   * POST /auth/webauthn/login/verify
   * Rate limited: 5 requests per 60 seconds
   */
  @Post('webauthn/login/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify WebAuthn authentication and complete passkey login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async verifyWebAuthnLogin(
    @Body() body: WebAuthnLoginVerifyDto,
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.loginWithPasskey(body.response, body.sessionId, ipAddress, userAgent);
  }

  // ==================== PASSWORD RESET ====================

  /**
   * Request password reset
   * POST /auth/forgot-password
   * Rate limited: 3 requests per 60 seconds to prevent email bombing
   */
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(body.email, body.tenantSlug);
  }

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  /**
   * Get current logged-in user
   * GET /auth/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCurrentUser(@Request() req: AuthenticatedRequest) {
    return req.user;
  }

  /**
   * Logout user
   * POST /auth/logout
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@Request() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.sessionId);
    return { message: 'Successfully logged out' };
  }

  /**
   * Google OAuth callback
   * POST /auth/google/callback
   */
  @Post('google/callback')
  async googleCallback(@Body() _body: { code: string; tenantSlug?: string }) {
    throw new GoneException({
      message: 'Questo endpoint è stato deprecato. Utilizza /providers/google/{auth-url,connect}.',
      documentation: 'docs/implementation/PROVIDER_INTEGRATION_GUIDE.md',
    });
  }

  /**
   * Microsoft OAuth callback
   * POST /auth/microsoft/callback
   */
  @Post('microsoft/callback')
  async microsoftCallback(@Body() _body: { code: string; tenantSlug?: string }) {
    throw new GoneException({
      message: 'Questo endpoint è stato deprecato. Utilizza /providers/microsoft/{auth-url,connect}.',
      documentation: 'docs/implementation/PROVIDER_INTEGRATION_GUIDE.md',
    });
  }
}
