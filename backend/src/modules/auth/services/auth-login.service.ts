import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { OtpSecurityService } from './otp-security.service';
import { TotpService } from './totp.service';
import { BackupCodesService } from './backup-codes.service';
import { TrustedDeviceService } from './trusted-device.service';
import { WebAuthnService } from './webauthn.service';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordPolicyService } from './password-policy.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { nanoid } from 'nanoid';
import { Request as ExpressRequest } from 'express';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/** Minimum password length for soft policy warning (matches PasswordPolicyService) */
const PASSWORD_POLICY_MIN_LENGTH = 15;

/**
 * Handles login, passkey auth, MFA challenge, and session creation.
 * Extracted from AuthService for maintainability.
 *
 * Phase 48 hardening:
 * - Dual-algo password verify via PasswordHashingService (bcrypt + Argon2id)
 * - Transparent Argon2id rehash on successful bcrypt login
 * - Timing-safe dummy hash on user-not-found
 * - Unified "Invalid credentials" error messages
 * - Per-email rate limiting alongside per-IP
 * - Soft password policy warning on login
 */
@Injectable()
export class AuthLoginService {
  private readonly logger = new Logger(AuthLoginService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpSecurity: OtpSecurityService,
    private totpService: TotpService,
    private backupCodesService: BackupCodesService,
    private trustedDeviceService: TrustedDeviceService,
    private webauthnService: WebAuthnService,
    private rateLimiter: RedisRateLimiterService,
    private passwordHashingService: PasswordHashingService,
    private passwordPolicyService: PasswordPolicyService,
  ) {}

  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Create session and return tokens
   */
  async createSession(
    user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string },
    tenant: { id: string },
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    // Auth runs pre-login: no tenant context in AsyncLocalStorage yet
    return withoutTenantScopingAsync(() => this._createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn));
  }

  private async _createSession(
    user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string },
    tenant: { id: string },
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    const sessionId = nanoid();
    const token = this.jwtService.sign({
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
    });

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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Create refresh token if the function is provided (AUTH-02)
    let refreshToken: string | undefined;
    if (createRefreshTokenFn) {
      const refreshResult = await createRefreshTokenFn(user.id, tenant.id);
      refreshToken = refreshResult.token;
    }

    this.logger.log(JSON.stringify({ event: 'user_logged_in', userId: user.id, email: this.redactEmail(user.email) }));

    return {
      success: true,
      accessToken: token,
      ...(refreshToken && { refreshToken }),
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
   * Verify OTP code and create session
   */
  async verifyOtpCode(
    email: string,
    code: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    return withoutTenantScopingAsync(() => this._verifyOtpCode(email, code, tenantSlug, ipAddress, userAgent, createRefreshTokenFn));
  }

  private async _verifyOtpCode(
    email: string,
    code: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Invalid email or code');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });
    if (!user) throw new UnauthorizedException('Invalid email or code');

    if (!user.isActive) {
      this.logger.warn(JSON.stringify({ event: 'otp_verify_user_inactive', userId: user.id }));
      throw new ForbiddenException('Account is disabled');
    }

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

    // OTP verified — create session with refresh token (same path as password login)
    this.logger.log(JSON.stringify({ event: 'otp_verified', userId: user.id, email: this.redactEmail(user.email) }));

    return this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn);
  }

  /**
   * Login user with MFA flow
   */
  async login(
    email: string,
    password: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
    deviceToken?: string,
    request?: ExpressRequest,
    sendOtpCodeFn?: (email: string, slug: string) => Promise<any>,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    return withoutTenantScopingAsync(() => this._login(email, password, tenantSlug, ipAddress, userAgent, deviceToken, request, sendOtpCodeFn, createRefreshTokenFn));
  }

  private async _login(
    email: string,
    password: string,
    tenantSlug?: string,
    ipAddress?: string,
    userAgent?: string,
    deviceToken?: string,
    request?: ExpressRequest,
    sendOtpCodeFn?: (email: string, slug: string) => Promise<any>,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const ipKey = `login:${ipAddress || 'unknown'}`;
    const emailKey = `login:email:${normalizedEmail}`;

    // Check both IP and email lockout in parallel
    const [ipLockout, emailLockout] = await Promise.all([
      this.rateLimiter.isLockedOut(ipKey),
      this.rateLimiter.isLockedOut(emailKey),
    ]);

    if (ipLockout.isLockedOut || emailLockout.isLockedOut) {
      const lockout = ipLockout.isLockedOut ? ipLockout : emailLockout;
      this.logger.warn(
        JSON.stringify({
          event: 'login_locked_out', ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
          dimension: ipLockout.isLockedOut ? 'ip' : 'email',
          lockoutEndsAt: lockout.lockoutEndsAt?.toISOString(),
        }),
      );
      throw new ForbiddenException(
        'Account temporarily locked due to too many failed attempts.',
      );
    }

    const rateLimit = await this.rateLimiter.checkRateLimit(ipKey, 10, 60);
    if (!rateLimit.allowed) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_rate_limited', ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
          resetAt: rateLimit.resetAt.toISOString(),
        }),
      );
      throw new ForbiddenException(
        `Too many login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      // Unified error: do NOT reveal tenant existence
      await this.passwordHashingService.dummyHash();
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (!user) {
      // Timing-safe: run dummy Argon2id hash before returning error
      await this.passwordHashingService.dummyHash();
      await Promise.all([
        this.rateLimiter.recordFailedAttempt(ipKey, 5, 900),
        this.rateLimiter.recordFailedAttempt(emailKey, 10, 900),
      ]);
      this.logger.warn(
        JSON.stringify({ event: 'login_failed_user_not_found', ip: ipAddress, email: this.redactEmail(normalizedEmail) }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Dual-algo password verification via PasswordHashingService
    const { valid: isPasswordValid, needsRehash } =
      await this.passwordHashingService.verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      await Promise.all([
        this.rateLimiter.recordFailedAttempt(ipKey, 5, 900),
        this.rateLimiter.recordFailedAttempt(emailKey, 10, 900),
      ]);
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_invalid_password', ip: ipAddress,
          userId: user.id,
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear rate limits on both dimensions
    await Promise.all([
      this.rateLimiter.clearFailedAttempts(ipKey),
      this.rateLimiter.clearFailedAttempts(emailKey),
    ]);

    // Transparent bcrypt -> Argon2id rehash (non-blocking to login flow)
    if (needsRehash) {
      const newHash = await this.passwordHashingService.hashPassword(password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
      this.logger.log(JSON.stringify({
        event: 'password_rehashed_to_argon2id',
        userId: user.id,
      }));
    }

    // Soft password policy warning (non-blocking, length-only check)
    const passwordPolicyWarning = password.length < PASSWORD_POLICY_MIN_LENGTH;

    if (user.isMfaEnabled) {
      if (deviceToken && request) {
        const isTrusted = await this.trustedDeviceService.verifyDevice(user.id, deviceToken, request);
        if (isTrusted) {
          this.logger.log(JSON.stringify({ event: 'mfa_skipped_trusted_device', userId: user.id }));
          return { ...await this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn), passwordPolicyWarning };
        }
      }

      const totpEnabled = await this.totpService.isEnabled(user.id);
      const backupCodesRemaining = await this.backupCodesService.getRemainingCount(tenant.id, user.id);

      if (totpEnabled) {
        const mfaToken = this.jwtService.sign(
          { userId: user.id, tenantId: tenant.id, type: 'mfa-challenge' },
          { expiresIn: '5m' },
        );
        return {
          mfaRequired: true, mfaToken,
          availableMethods: ['totp', ...(backupCodesRemaining > 0 ? ['backup'] : []), 'email'],
          message: 'Multi-factor authentication required',
          passwordPolicyWarning,
        };
      }

      if (sendOtpCodeFn) {
        await sendOtpCodeFn(normalizedEmail, slug);
      }
      return { mfaRequired: true, availableMethods: ['email'], message: 'OTP code has been sent to your email', passwordPolicyWarning };
    }

    return { ...await this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn), passwordPolicyWarning };
  }

  /**
   * Login with passkey (WebAuthn)
   */
  async loginWithPasskey(
    response: Record<string, unknown>,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    return withoutTenantScopingAsync(() => this._loginWithPasskey(response, sessionId, ipAddress, userAgent, createRefreshTokenFn));
  }

  private async _loginWithPasskey(
    response: Record<string, unknown>,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    const result = await this.webauthnService.verifyLogin(
      response as unknown as Parameters<typeof this.webauthnService.verifyLogin>[0],
      sessionId,
    );

    if (!result.success || !result.user) {
      throw new UnauthorizedException(result.error || 'Passkey authentication failed');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.user.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, tenantId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account not active');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, isActive: true },
    });
    if (!tenant || !tenant.isActive) throw new UnauthorizedException('Tenant not active');

    this.logger.log(
      JSON.stringify({ event: 'passkey_login_success', userId: user.id, email: user.email.substring(0, 2) + '***' }),
    );

    return this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn);
  }

  /**
   * Get WebAuthn login options
   */
  async getWebAuthnLoginOptions(email: string, tenantSlug?: string) {
    return withoutTenantScopingAsync(async () => {
      const result = await this.webauthnService.generateLoginOptions(email, tenantSlug);
      if (!result) throw new BadRequestException('Unable to generate passkey options');
      return result;
    });
  }

  /**
   * Verify MFA challenge (TOTP, backup code, or email OTP)
   */
  async verifyMfaChallenge(
    mfaToken: string,
    method: 'totp' | 'backup' | 'email',
    code: string,
    trustDevice: boolean = false,
    request?: ExpressRequest,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    return withoutTenantScopingAsync(() => this._verifyMfaChallenge(mfaToken, method, code, trustDevice, request, ipAddress, userAgent, createRefreshTokenFn));
  }

  private async _verifyMfaChallenge(
    mfaToken: string,
    method: 'totp' | 'backup' | 'email',
    code: string,
    trustDevice: boolean = false,
    request?: ExpressRequest,
    ipAddress?: string,
    userAgent?: string,
    createRefreshTokenFn?: (userId: string, tenantId: string) => Promise<{ token: string; familyId: string }>,
  ) {
    let payload: { userId: string; tenantId: string; type: string };
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'mfa-challenge') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: payload.tenantId } });
    if (!tenant) throw new UnauthorizedException('Tenant not found');

    switch (method) {
      case 'totp': {
        const result = await this.totpService.verifyCode(user.id, code);
        if (!result.success) throw new UnauthorizedException('Invalid TOTP code');
        break;
      }
      case 'backup': {
        const result = await this.backupCodesService.verify(tenant.id, user.id, code);
        if (!result.success) {
          throw new UnauthorizedException(
            result.reason === 'already_used' ? 'This backup code has already been used' : 'Invalid backup code',
          );
        }
        break;
      }
      case 'email': {
        const result = await this.otpSecurity.verifyOtp(user.id, code, 'email');
        if (!result.success) {
          if (result.reason === 'locked_out') {
            throw new ForbiddenException(`Account temporarily locked. Try again after ${result.lockoutEndsAt?.toISOString()}`);
          }
          throw new UnauthorizedException(`Invalid or expired OTP code. ${result.attemptsRemaining} attempts remaining.`);
        }
        break;
      }
      default:
        throw new BadRequestException('Invalid MFA method');
    }

    this.logger.log(JSON.stringify({ event: 'mfa_verified', userId: user.id, method }));

    const sessionResult = await this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn);

    let deviceTokenResult: string | undefined;
    if (trustDevice && request) {
      deviceTokenResult = await this.trustedDeviceService.trustDevice(tenant.id, user.id, request);
    }

    return { ...sessionResult, ...(deviceTokenResult && { deviceToken: deviceTokenResult }) };
  }
}
