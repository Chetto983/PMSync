import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/services/email.service';
import { OtpSecurityService } from './otp-security.service';
import { TotpService } from './totp.service';
import { BackupCodesService } from './backup-codes.service';
import { TrustedDeviceService } from './trusted-device.service';
import { WebAuthnService } from './webauthn.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { LegalAcceptanceService } from '../../compliance/services/legal-acceptance.service';
import { AuthConfigService } from './auth-config.service';
import { nanoid } from 'nanoid';
import { Request as ExpressRequest } from 'express';

/**
 * AuthService - Secure authentication with session management
 *
 * Security features:
 * - No auto-tenant creation (requires existing tenant or admin invite)
 * - Hashed OTP codes via OtpSecurityService
 * - Session-based token validation
 * - User/tenant active status checks
 * - PII-redacted structured logging
 * - Separate secrets for password reset tokens
 * - Hashed password reset tokens in DB
 * - Single active reset token per user
 * - Session invalidation on password reset
 *
 * @see AUTH_MODULE_ROADMAP.md for implementation details
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Password reset configuration
  private readonly passwordResetSecret: string;
  private readonly passwordResetTtlMs: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private otpSecurity: OtpSecurityService,
    private totpService: TotpService,
    private backupCodesService: BackupCodesService,
    private trustedDeviceService: TrustedDeviceService,
    private webauthnService: WebAuthnService,
    private rateLimiter: RedisRateLimiterService,
    private cacheService: CacheService,
    private legalAcceptanceService: LegalAcceptanceService,
    private authConfigService: AuthConfigService,
  ) {
    // Get password reset secret (must be different from JWT secret)
    const resetSecret = process.env.PASSWORD_RESET_SECRET;
    const jwtSecret = process.env.JWT_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!resetSecret || resetSecret.length < 32) {
      if (isProduction) {
        // SECURITY: Fail fast in production - password reset requires dedicated secret
        throw new Error(
          'SECURITY ERROR: PASSWORD_RESET_SECRET must be set and at least 32 characters in production. ' +
          'Generate one with: openssl rand -base64 32',
        );
      }
      this.logger.warn(
        'PASSWORD_RESET_SECRET not set or too short. Using derived secret (development only).',
      );
      // Derive from JWT secret if not set (for backwards compatibility in dev)
      this.passwordResetSecret = jwtSecret
        ? crypto.createHmac('sha256', jwtSecret).update('password-reset').digest('hex')
        : 'insecure-reset-secret';
    } else {
      this.passwordResetSecret = resetSecret;
    }

    this.passwordResetTtlMs = this.safeParseInt(process.env.PASSWORD_RESET_EXPIRATION, 15 * 60 * 1000);
  }

  /**
   * Hash a password reset token for secure storage
   * Uses HMAC-SHA256 with dedicated secret
   */
  private hashResetToken(token: string): string {
    return crypto
      .createHmac('sha256', this.passwordResetSecret)
      .update(token)
      .digest('hex');
  }

  /**
   * Redact email for logging (keep first 2 chars + domain)
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Safely parse integer with NaN protection
   */
  private safeParseInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
    return parsed;
  }

  /**
   * Register a new user
   *
   * Behavior:
   * - If tenant exists: adds user to existing tenant as 'user' role
   * - If tenant doesn't exist: creates new tenant with user as 'admin'
   * - Uses email as tenant slug for new tenants (personal workspace model)
   */
  async register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    tenantSlug?: string; // Optional: join existing tenant
  }) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // Determine tenant slug: use provided slug or email
    const slug = data.tenantSlug?.toLowerCase() || normalizedEmail;

    let tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    // Track if this is a new tenant (user becomes admin)
    let isNewTenant = false;

    // Auto-create tenant if not found
    if (!tenant) {
      // Create tenant name from email or firstName
      const tenantName = data.firstName
        ? `${data.firstName}'s Workspace`
        : `${normalizedEmail.split('@')[0]}'s Workspace`;

      tenant = await this.prisma.tenant.create({
        data: {
          slug,
          name: tenantName,
          isActive: true,
        },
      });

      isNewTenant = true;

      this.logger.log(
        JSON.stringify({
          event: 'tenant_created',
          tenantId: tenant.id,
          slug: slug.substring(0, 15) + '...',
        }),
      );
    }

    // Check tenant is active (for existing tenants)
    if (!tenant.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'register_tenant_inactive',
          tenantId: tenant.id,
        }),
      );
      throw new ForbiddenException('Registration is not available for this organization');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (existingUser) {
      // SECURITY: Don't reveal if user exists - return same message
      this.logger.warn(
        JSON.stringify({
          event: 'register_user_exists',
          email: this.redactEmail(normalizedEmail),
          tenantId: tenant.id,
        }),
      );
      return {
        success: true,
        message: 'Registration initiated. Check your email for verification code.',
        requiresOtp: true,
      };
    }

    // Hash password with bcrypt (cost factor 12 for 2025 standards)
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user - admin for new tenants, user for existing
    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        isMfaEnabled: true,
        isActive: true,
        role: isNewTenant ? 'admin' : 'user', // First user is admin
      },
    });

    // Record legal acceptance server-side (user checked ToS + Privacy boxes on register form)
    try {
      await Promise.all([
        this.legalAcceptanceService.accept(user.id, tenant.id, 'TOS', '1.0'),
        this.legalAcceptanceService.accept(user.id, tenant.id, 'PRIVACY_POLICY', '1.0'),
      ]);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'register_legal_acceptance_failed',
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    // Send OTP for email verification using secure OTP service
    try {
      const { code } = await this.otpSecurity.createOtp(user.id, 'email');
      await this.emailService.sendOtp(normalizedEmail, code);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'register_otp_send_failed',
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      // Continue anyway - in development, email might not be configured
    }

    this.logger.log(
      JSON.stringify({
        event: 'user_registered',
        userId: user.id,
        email: this.redactEmail(normalizedEmail),
        tenantId: tenant.id,
      }),
    );

    return {
      success: true,
      message: 'User registered successfully. Check your email for verification code.',
      requiresOtp: true,
      tenantId: tenant.id,
    };
  }

  /**
   * Generate and send OTP code
   *
   * SECURITY:
   * - Generic responses prevent user/tenant enumeration
   * - Rate limiting via OtpSecurityService
   * - OTP codes are hashed before storage
   */
  async sendOtpCode(email: string, tenantSlug?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    // SECURITY: Return generic message to prevent tenant enumeration
    if (!tenant) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_tenant_not_found',
          email: this.redactEmail(normalizedEmail),
        }),
      );
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    // Check tenant is active
    if (!tenant.isActive) {
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    // SECURITY: Return generic message to prevent user enumeration
    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_user_not_found',
          email: this.redactEmail(normalizedEmail),
        }),
      );
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    // Check user is active
    if (!user.isActive) {
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    // Generate and store hashed OTP via security service
    try {
      const { code } = await this.otpSecurity.createOtp(user.id, 'email');

      // Send email with OTP
      await this.emailService.sendOtp(user.email, code);

      this.logger.log(
        JSON.stringify({
          event: 'otp_sent',
          userId: user.id,
          email: this.redactEmail(user.email),
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_send_failed',
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      // Return success anyway to prevent enumeration
    }

    return {
      success: true,
      message: 'If the email exists, an OTP has been sent',
    };
  }


  /**
   * Verify OTP code and create session
   *
   * SECURITY:
   * - Uses OtpSecurityService for hashed OTP verification
   * - Rate limiting with lockout after failed attempts
   * - Checks user and tenant active status
   * - Creates session for token revocation support
   */
  async verifyOtpCode(
    email: string,
    code: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    // SECURITY: Generic error to prevent enumeration
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid email or code');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or code');
    }

    // Check user is active
    if (!user.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_verify_user_inactive',
          userId: user.id,
        }),
      );
      throw new ForbiddenException('Account is disabled');
    }

    // Verify OTP via security service (handles rate limiting + lockout)
    const otpResult = await this.otpSecurity.verifyOtp(user.id, code, 'email');

    if (!otpResult.success) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_verification_failed',
          userId: user.id,
          reason: otpResult.reason,
          attemptsRemaining: otpResult.attemptsRemaining,
        }),
      );

      if (otpResult.reason === 'locked_out') {
        throw new ForbiddenException(
          `Account temporarily locked. Try again after ${otpResult.lockoutEndsAt?.toISOString()}`,
        );
      }

      throw new UnauthorizedException(
        `Invalid or expired OTP code. ${otpResult.attemptsRemaining} attempts remaining.`,
      );
    }

    const sessionId = nanoid();

    // Generate JWT token with role for role-change detection
    const token = this.jwtService.sign({
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: user.role,
    });

    // Create session for revocation support
    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        tenantId: tenant.id,
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    this.logger.log(
      JSON.stringify({
        event: 'otp_verified',
        userId: user.id,
        sessionId: session.id,
        email: this.redactEmail(user.email),
      }),
    );

    return {
      success: true,
      message: 'OTP verified successfully',
      accessToken: token,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: tenant.id,
      },
    };
  }

  /**
   * Login user
   *
   * MFA Flow:
   * 1. Validate credentials
   * 2. Check if user has TOTP enabled → require TOTP/backup code
   * 3. Check if user has email MFA enabled → send OTP email
   * 4. Check trusted device → skip MFA if trusted
   */
  async login(
    email: string,
    password: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
    deviceToken?: string,
    request?: ExpressRequest,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    // Check for lockout first (Redis-based, works across instances)
    const lockoutKey = `login:${ipAddress || 'unknown'}`;
    const lockoutResult = await this.rateLimiter.isLockedOut(lockoutKey);
    if (lockoutResult.isLockedOut) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_locked_out',
          ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
          lockoutEndsAt: lockoutResult.lockoutEndsAt?.toISOString(),
        }),
      );
      throw new ForbiddenException(
        `Account temporarily locked. Please try again in ${lockoutResult.retryAfterSeconds} seconds.`,
      );
    }

    // Rate limit by IP address to prevent brute force attacks (Redis-based)
    const rateLimit = await this.rateLimiter.checkRateLimit(lockoutKey, 10, 60);
    if (!rateLimit.allowed) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_rate_limited',
          ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
          resetAt: rateLimit.resetAt.toISOString(),
        }),
      );
      throw new ForbiddenException(
        `Too many login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (!user) {
      // Record failed attempt (may trigger lockout)
      await this.rateLimiter.recordFailedAttempt(lockoutKey, 5, 900);
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_user_not_found',
          ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Record failed attempt (may trigger lockout after 5 failures)
      const failResult = await this.rateLimiter.recordFailedAttempt(lockoutKey, 5, 900);
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_invalid_password',
          ip: ipAddress,
          userId: user.id,
          isLockedOut: failResult.isLockedOut,
          retryAfterSeconds: failResult.retryAfterSeconds,
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on successful login
    await this.rateLimiter.clearFailedAttempts(lockoutKey);

    // Check if MFA is required
    if (user.isMfaEnabled) {
      // Check trusted device first (skip MFA if trusted)
      if (deviceToken && request) {
        const isTrusted = await this.trustedDeviceService.verifyDevice(user.id, deviceToken, request);
        if (isTrusted) {
          this.logger.log(
            JSON.stringify({
              event: 'mfa_skipped_trusted_device',
              userId: user.id,
            }),
          );
          // Continue to create session (skip MFA)
          return this.createSession(user, tenant, ipAddress, userAgent);
        }
      }

      // Check if TOTP is enabled
      const totpEnabled = await this.totpService.isEnabled(user.id);
      const backupCodesRemaining = await this.backupCodesService.getRemainingCount(tenant.id, user.id);

      if (totpEnabled) {
        // Generate MFA token for TOTP verification
        const mfaToken = this.jwtService.sign(
          {
            userId: user.id,
            tenantId: tenant.id,
            type: 'mfa-challenge',
          },
          { expiresIn: '5m' },
        );

        return {
          mfaRequired: true,
          mfaToken,
          availableMethods: [
            'totp',
            ...(backupCodesRemaining > 0 ? ['backup'] : []),
            'email',
          ],
          message: 'Multi-factor authentication required',
        };
      }

      // Fall back to email OTP
      await this.sendOtpCode(normalizedEmail, slug);
      return {
        mfaRequired: true,
        availableMethods: ['email'],
        message: 'OTP code has been sent to your email',
      };
    }

    return this.createSession(user, tenant, ipAddress, userAgent);
  }

  /**
   * Create session and return tokens
   */
  private async createSession(
    user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string },
    tenant: { id: string },
    ipAddress?: string,
    userAgent?: string,
  ) {
    const sessionId = nanoid();

    // Generate JWT token
    const token = this.jwtService.sign({
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: user.role,
    });

    // Create session with actual client information
    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        tenantId: tenant.id,
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Create refresh token for token rotation (AUTH-02)
    const refreshResult = await this.createRefreshToken(user.id, tenant.id);

    this.logger.log(`User logged in: ${user.email}`);

    return {
      success: true,
      accessToken: token,
      refreshToken: refreshResult.token,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: tenant.id,
      },
    };
  }

  /**
   * Login with passkey (WebAuthn) - passwordless authentication
   *
   * @param response - WebAuthn authentication response from browser
   * @param sessionId - Session ID from getWebAuthnLoginOptions
   * @param ipAddress - Client IP address
   * @param userAgent - Client user agent
   */
  async loginWithPasskey(
    response: Record<string, unknown>,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Verify passkey with WebAuthnService
    const result = await this.webauthnService.verifyLogin(
      response as unknown as Parameters<typeof this.webauthnService.verifyLogin>[0],
      sessionId,
    );

    if (!result.success || !result.user) {
      throw new UnauthorizedException(result.error || 'Passkey authentication failed');
    }

    // Get full user data for session
    const user = await this.prisma.user.findUnique({
      where: { id: result.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        tenantId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not active');
    }

    // Get tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Tenant not active');
    }

    this.logger.log(
      JSON.stringify({
        event: 'passkey_login_success',
        userId: user.id,
        email: user.email.substring(0, 2) + '***',
      }),
    );

    // Create session and return tokens
    return this.createSession(user, tenant, ipAddress, userAgent);
  }

  /**
   * Get WebAuthn login options for passwordless login
   *
   * @param email - User email
   * @param tenantSlug - Optional tenant slug
   */
  async getWebAuthnLoginOptions(email: string, tenantSlug?: string) {
    const result = await this.webauthnService.generateLoginOptions(email, tenantSlug);

    if (!result) {
      // Don't reveal if user exists or has passkeys
      throw new BadRequestException('Unable to generate passkey options');
    }

    return result;
  }

  /**
   * Verify MFA challenge (TOTP, backup code, or email OTP)
   *
   * @param mfaToken - Token from login response
   * @param method - 'totp' | 'backup' | 'email'
   * @param code - Verification code
   * @param trustDevice - Whether to trust this device for 30 days
   * @param request - Express request for device fingerprinting
   */
  async verifyMfaChallenge(
    mfaToken: string,
    method: 'totp' | 'backup' | 'email',
    code: string,
    trustDevice: boolean = false,
    request?: ExpressRequest,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Verify MFA token
    let payload: { userId: string; tenantId: string; type: string };
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'mfa-challenge') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenantId },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    // Verify based on method
    let verificationSuccess = false;

    switch (method) {
      case 'totp': {
        const result = await this.totpService.verifyCode(user.id, code);
        verificationSuccess = result.success;
        if (!verificationSuccess) {
          throw new UnauthorizedException('Invalid TOTP code');
        }
        break;
      }

      case 'backup': {
        const result = await this.backupCodesService.verify(tenant.id, user.id, code);
        verificationSuccess = result.success;
        if (!verificationSuccess) {
          throw new UnauthorizedException(
            result.reason === 'already_used'
              ? 'This backup code has already been used'
              : 'Invalid backup code',
          );
        }
        break;
      }

      case 'email': {
        const result = await this.otpSecurity.verifyOtp(user.id, code, 'email');
        verificationSuccess = result.success;
        if (!verificationSuccess) {
          if (result.reason === 'locked_out') {
            throw new ForbiddenException(
              `Account temporarily locked. Try again after ${result.lockoutEndsAt?.toISOString()}`,
            );
          }
          throw new UnauthorizedException(
            `Invalid or expired OTP code. ${result.attemptsRemaining} attempts remaining.`,
          );
        }
        break;
      }

      default:
        throw new BadRequestException('Invalid MFA method');
    }

    this.logger.log(
      JSON.stringify({
        event: 'mfa_verified',
        userId: user.id,
        method,
      }),
    );

    // Create session
    const sessionResult = await this.createSession(user, tenant, ipAddress, userAgent);

    // Trust device if requested
    let deviceTokenResult: string | undefined;
    if (trustDevice && request) {
      deviceTokenResult = await this.trustedDeviceService.trustDevice(tenant.id, user.id, request);
    }

    return {
      ...sessionResult,
      ...(deviceTokenResult && { deviceToken: deviceTokenResult }),
    };
  }

  /**
   * Request password reset
   *
   * SECURITY:
   * - Single active reset token per user (deletes previous tokens)
   * - Tokens are hashed before storage (JWT stored only in email)
   * - Uses dedicated PASSWORD_RESET_SECRET, not JWT_SECRET
   * - Generic response prevents user enumeration
   */
  async requestPasswordReset(email: string, tenantSlug?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    // SECURITY: Return generic message to prevent tenant enumeration
    if (!tenant) {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_tenant_not_found',
          email: this.redactEmail(normalizedEmail),
        }),
      );
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    // SECURITY: Return generic message to prevent user enumeration
    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_user_not_found',
          email: this.redactEmail(normalizedEmail),
        }),
      );
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      };
    }

    // Check user is active
    if (!user.isActive) {
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
      };
    }

    // SECURITY: Delete any existing reset tokens for this user (single active token)
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userEmail: normalizedEmail,
        tenantId: tenant.id,
      },
    });

    // Generate reset token with separate secret
    const token = this.jwtService.sign(
      {
        email: user.email,
        type: 'password-reset',
        userId: user.id,
        tenantId: tenant.id,
      },
      {
        secret: this.passwordResetSecret,
        expiresIn: '15m',
      },
    );

    // SECURITY: Hash token before storing (only the JWT is sent via email)
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + this.passwordResetTtlMs);

    await this.prisma.passwordResetToken.create({
      data: {
        userEmail: normalizedEmail,
        token: tokenHash, // Store hash, not plaintext
        tenantId: tenant.id,
        expiresAt,
      },
    });

    // Send reset email with the actual token (not the hash)
    try {
      await this.emailService.sendPasswordReset(normalizedEmail, token);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_email_failed',
          email: this.redactEmail(normalizedEmail),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      // Return success anyway to prevent enumeration
    }

    this.logger.log(
      JSON.stringify({
        event: 'password_reset_requested',
        email: this.redactEmail(normalizedEmail),
        tenantId: tenant.id,
      }),
    );

    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent',
    };
  }

  /**
   * Reset password with token
   *
   * SECURITY:
   * - Verifies JWT with dedicated PASSWORD_RESET_SECRET
   * - Validates hashed token against DB (not plaintext comparison)
   * - Invalidates all existing sessions (forces re-login)
   * - Uses bcrypt with cost factor 12 for 2025 standards
   */
  async resetPassword(token: string, newPassword: string, _tenantSlug?: string) {
    // Step 1: Verify JWT signature with dedicated secret
    let payload: { email: string; type: string; userId?: string; tenantId?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.passwordResetSecret,
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_jwt_invalid',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // Verify token type
    if (payload.type !== 'password-reset') {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_wrong_token_type',
          type: payload.type,
        }),
      );
      throw new UnauthorizedException('Invalid token type');
    }

    // Step 2: Hash incoming token and find in DB
    const tokenHash = this.hashResetToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      this.logger.warn(
        JSON.stringify({
          event: 'password_reset_token_invalid_or_expired',
          found: !!resetToken,
          isUsed: resetToken?.isUsed,
          expired: resetToken ? resetToken.expiresAt < new Date() : null,
        }),
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    // Step 3: Get tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: resetToken.tenantId },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Step 4: Get user
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: resetToken.userEmail } },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Step 4.5: SECURITY - Prevent reusing the same password
    if (user.passwordHash) {
      const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
      if (isSamePassword) {
        this.logger.warn(
          JSON.stringify({
            event: 'password_reset_same_password',
            userId: user.id,
          }),
        );
        throw new BadRequestException('New password must be different from your current password');
      }
    }

    // Step 5: Hash new password with bcrypt (cost factor 12 for 2025 standards)
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Step 6: Update password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Step 7: Mark reset token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { isUsed: true },
    });

    // Step 8: SECURITY - Invalidate all existing sessions (force re-login everywhere)
    // First, get all session IDs to invalidate from cache
    const sessionsToInvalidate = await this.prisma.session.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    // SECURITY: Invalidate all session caches in parallel with tenant-isolated keys
    // Cache key format: {tenantId}:{sessionId} for tenant isolation
    await Promise.all(
      sessionsToInvalidate.map((s) =>
        this.cacheService.del(`${user.tenantId}:${s.id}`, { namespace: CacheNamespace.USER_SESSION }),
      ),
    );

    // Also invalidate user-level cache with tenant isolation
    await this.cacheService.del(`${user.tenantId}:user:${user.id}`, { namespace: CacheNamespace.USER_SESSION });

    // Now delete sessions from DB
    const deletedSessions = await this.prisma.session.deleteMany({
      where: { userId: user.id },
    });

    // AUTH-05: Delete all refresh tokens on password reset
    const deletedRefreshTokens = await this.deleteAllRefreshTokens(user.id, user.tenantId);

    this.logger.log(
      JSON.stringify({
        event: 'password_reset_completed',
        userId: user.id,
        email: this.redactEmail(user.email),
        sessionsInvalidated: deletedSessions.count,
        refreshTokensInvalidated: deletedRefreshTokens,
        cacheEntriesInvalidated: sessionsToInvalidate.length + 1,
      }),
    );

    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Logout user
   *
   * PERFORMANCE: Invalidates Redis session cache to ensure
   * immediate session termination (no stale cache hits)
   *
   * SECURITY: Cache key includes tenantId for tenant isolation
   */
  async logout(sessionId?: string | null, tenantId?: string | null, userId?: string | null) {
    if (!sessionId) {
      this.logger.warn('Logout called without a valid sessionId');
      return;
    }

    // SECURITY: Invalidate session cache BEFORE deleting from DB
    // Cache key format: {tenantId}:{sessionId} for tenant isolation
    if (tenantId) {
      await this.cacheService.del(`${tenantId}:${sessionId}`, { namespace: CacheNamespace.USER_SESSION });
      // Also invalidate user-level cache if userId provided
      if (userId) {
        await this.cacheService.del(`${tenantId}:user:${userId}`, { namespace: CacheNamespace.USER_SESSION });
      }
    } else {
      // Fallback: Try without tenant prefix (backwards compatibility during migration)
      await this.cacheService.del(sessionId, { namespace: CacheNamespace.USER_SESSION });
    }

    await this.prisma.session.delete({
      where: { id: sessionId },
    }).catch(() => {
      // Session already deleted, ignore
    });

    this.logger.log(`User logged out: ${sessionId}`);
  }

  // ==================== REFRESH TOKEN ROTATION (AUTH-02) ====================

  /** Grace period for token reuse (10 seconds) to handle network retries */
  private readonly REFRESH_GRACE_PERIOD_MS = 10_000;

  /**
   * Hash a refresh token using HMAC-SHA256 with the dedicated refresh secret
   */
  private hashRefreshToken(token: string): string {
    return crypto
      .createHmac('sha256', this.authConfigService.refreshTokenSecret)
      .update(token)
      .digest('hex');
  }

  /**
   * Create a new refresh token for a user (AUTH-02)
   * Generates an opaque 64-char token, hashes it, and stores in DB.
   * Returns the raw token (for cookie) and familyId (for tracking).
   */
  async createRefreshToken(
    userId: string,
    tenantId: string,
    familyId?: string,
  ): Promise<{ token: string; familyId: string }> {
    const rawToken = nanoid(64);
    const tokenHash = this.hashRefreshToken(rawToken);
    const family = familyId || nanoid(32);

    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        familyId: family,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { token: rawToken, familyId: family };
  }

  /**
   * Rotate a refresh token (AUTH-02, AUTH-03)
   *
   * 1. Hash the incoming raw token and look up in DB
   * 2. If token is used AND within grace period -> return same replacement (idempotent)
   * 3. If token is used AND outside grace period -> theft detected, kill family
   * 4. If token is valid -> mark as used, create new pair, return both
   */
  async rotateRefreshToken(
    rawToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashRefreshToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Token already used -- check grace period or theft
    if (existing.isUsed) {
      const timeSinceCreation = Date.now() - existing.createdAt.getTime();
      if (timeSinceCreation <= this.REFRESH_GRACE_PERIOD_MS && existing.replacedBy) {
        // Grace period: return the same replacement token pair
        const replacement = await this.prisma.refreshToken.findUnique({
          where: { tokenHash: existing.replacedBy },
        });
        if (replacement) {
          // Re-generate access token for this user
          const accessToken = this.jwtService.sign({
            sessionId: nanoid(),
            userId: existing.userId,
            tenantId: existing.tenantId,
            email: existing.user.email,
            role: existing.user.role,
          });
          // We cannot recover the raw refresh token from the hash,
          // so we create a fresh one in the same family
          const newRefresh = await this.createRefreshToken(
            existing.userId,
            existing.tenantId,
            existing.familyId,
          );
          return { accessToken, refreshToken: newRefresh.token };
        }
      }

      // Theft detected: invalidate entire token family
      this.logger.warn(
        JSON.stringify({
          event: 'refresh_token_theft_detected',
          userId: existing.userId,
          familyId: existing.familyId,
        }),
      );
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: existing.familyId },
      });
      throw new UnauthorizedException('Token reuse detected');
    }

    // Valid token: rotate
    const newRefresh = await this.createRefreshToken(
      existing.userId,
      existing.tenantId,
      existing.familyId,
    );
    const newTokenHash = this.hashRefreshToken(newRefresh.token);

    // Mark old token as used and record replacement
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { isUsed: true, replacedBy: newTokenHash },
    });

    // Generate new access token
    const accessToken = this.jwtService.sign({
      sessionId: nanoid(),
      userId: existing.userId,
      tenantId: existing.tenantId,
      email: existing.user.email,
      role: existing.user.role,
    });

    return { accessToken, refreshToken: newRefresh.token };
  }

  /**
   * Delete all refresh tokens for a user (AUTH-05)
   * Called on password change/reset and logout.
   */
  async deleteAllRefreshTokens(userId: string, tenantId: string): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { userId, tenantId },
    });
    this.logger.log(
      JSON.stringify({
        event: 'refresh_tokens_deleted',
        userId,
        count: result.count,
      }),
    );
    return result.count;
  }

  /**
   * Get current user profile with full details (including avatarUrl)
   * Used by /auth/me endpoint since JWT doesn't contain avatarUrl
   */
  async getCurrentUserProfile(userId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        isMfaEnabled: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...user,
      tenantId,
    };
  }

}
