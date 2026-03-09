import {
  Injectable,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { OtpSecurityService } from './otp-security.service';
import { BackupCodesService } from './backup-codes.service';
import { TrustedDeviceService } from './trusted-device.service';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordPolicyService } from './password-policy.service';
import { AuthConfigService } from './auth-config.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { nanoid } from 'nanoid';
import { Request as ExpressRequest } from 'express';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/** Minimum password length for soft policy warning (matches PasswordPolicyService) */
const PASSWORD_POLICY_MIN_LENGTH = 8;

/**
 * Handles login, passkey auth, MFA challenge, and session creation.
 * Extracted from AuthService for maintainability.
 *
 * Phase 48 hardening:
 * - Argon2id password verification via PasswordHashingService
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
    private backupCodesService: BackupCodesService,
    private trustedDeviceService: TrustedDeviceService,
    private rateLimiter: RedisRateLimiterService,
    private passwordHashingService: PasswordHashingService,
    private passwordPolicyService: PasswordPolicyService,
    private authConfig: AuthConfigService,
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
    // Enforce session concurrency limit (OWASP ASVS V3)
    const existingSessions = await this.prisma.session.findMany({
      where: {
        userId: user.id,
        tenantId: tenant.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (existingSessions.length >= this.authConfig.maxSessionsPerUser) {
      const sessionsToDelete = existingSessions.slice(
        0,
        existingSessions.length - this.authConfig.maxSessionsPerUser + 1,
      );
      await this.prisma.session.deleteMany({
        where: { id: { in: sessionsToDelete.map((s) => s.id) } },
      });
      this.logger.log(
        JSON.stringify({
          event: 'session_eviction',
          userId: user.id,
          evictedCount: sessionsToDelete.length,
        }),
      );
    }

    const sessionId = nanoid();
    const token = this.jwtService.sign({
      type: 'access',
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
        expiresAt: new Date(Date.now() + this.authConfig.sessionTtlMs),
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        lastActivityAt: new Date(),
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
    const emailKey = `login:email:${slug}:${normalizedEmail}`;

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

    const { valid: isPasswordValid } =
      await this.passwordHashingService.verifyPassword(password, user.passwordHash!);

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

    // Block disabled accounts/orgs after credential verification
    if (!user.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_user_inactive',
          userId: user.id,
        }),
      );
      throw new ForbiddenException('Account is disabled');
    }

    if (!tenant.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_tenant_inactive',
          tenantId: tenant.id,
          userId: user.id,
        }),
      );
      throw new ForbiddenException('Organization is disabled');
    }

    // Clear rate limits on both dimensions
    await Promise.all([
      this.rateLimiter.clearFailedAttempts(ipKey),
      this.rateLimiter.clearFailedAttempts(emailKey),
    ]);

    // Soft password policy warning (non-blocking, length-only check)
    const passwordPolicyWarning = password.length < PASSWORD_POLICY_MIN_LENGTH;

    // NOTE: MFA is now handled by better-auth plugins (twoFactor, passkey).
    // The old custom TOTP/WebAuthn MFA flow has been removed (Phase 55-05).
    // The isMfaEnabled flag is deprecated; better-auth manages 2FA state directly.

    return { ...await this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn), passwordPolicyWarning };
  }

  // NOTE: loginWithPasskey, getWebAuthnLoginOptions, and verifyMfaChallenge
  // have been removed (Phase 55-05). Passkey login and MFA verification are
  // now handled entirely by better-auth plugins (passkey, twoFactor).
}
