import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { OtpSecurityService } from './otp-security.service';
import { TotpService } from './totp.service';
import { BackupCodesService } from './backup-codes.service';
import { TrustedDeviceService } from './trusted-device.service';
import { WebAuthnService } from './webauthn.service';
import { RedisRateLimiterService } from '../../../common/services/redis-rate-limiter.service';
import { nanoid } from 'nanoid';
import { Request as ExpressRequest } from 'express';

/**
 * Handles login, passkey auth, MFA challenge, and session creation.
 * Extracted from AuthService for maintainability.
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
    const sessionId = nanoid();
    const token = this.jwtService.sign({
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
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

    this.logger.log(`User logged in: ${user.email}`);

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

    // OTP-verified sessions use 7-day expiry (vs 24h for password login)
    const sessionId = nanoid();
    const token = this.jwtService.sign({
      sessionId, userId: user.id, tenantId: tenant.id, email: user.email, role: user.role,
    });
    const session = await this.prisma.session.create({
      data: {
        id: sessionId, tenantId: tenant.id, userId: user.id, token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: ipAddress || 'unknown', userAgent: userAgent || 'unknown',
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    this.logger.log(JSON.stringify({ event: 'otp_verified', userId: user.id, sessionId: session.id, email: this.redactEmail(user.email) }));

    return {
      success: true, message: 'OTP verified successfully', accessToken: token, sessionId: session.id,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, tenantId: tenant.id },
    };
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
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const lockoutKey = `login:${ipAddress || 'unknown'}`;
    const lockoutResult = await this.rateLimiter.isLockedOut(lockoutKey);
    if (lockoutResult.isLockedOut) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_locked_out', ip: ipAddress,
          email: this.redactEmail(normalizedEmail),
          lockoutEndsAt: lockoutResult.lockoutEndsAt?.toISOString(),
        }),
      );
      throw new ForbiddenException(
        `Account temporarily locked. Please try again in ${lockoutResult.retryAfterSeconds} seconds.`,
      );
    }

    const rateLimit = await this.rateLimiter.checkRateLimit(lockoutKey, 10, 60);
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
    if (!tenant) throw new BadRequestException('Tenant not found');

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (!user) {
      await this.rateLimiter.recordFailedAttempt(lockoutKey, 5, 900);
      this.logger.warn(
        JSON.stringify({ event: 'login_failed_user_not_found', ip: ipAddress, email: this.redactEmail(normalizedEmail) }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      const failResult = await this.rateLimiter.recordFailedAttempt(lockoutKey, 5, 900);
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed_invalid_password', ip: ipAddress,
          userId: user.id, isLockedOut: failResult.isLockedOut,
          retryAfterSeconds: failResult.retryAfterSeconds,
        }),
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.rateLimiter.clearFailedAttempts(lockoutKey);

    if (user.isMfaEnabled) {
      if (deviceToken && request) {
        const isTrusted = await this.trustedDeviceService.verifyDevice(user.id, deviceToken, request);
        if (isTrusted) {
          this.logger.log(JSON.stringify({ event: 'mfa_skipped_trusted_device', userId: user.id }));
          return this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn);
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
        };
      }

      if (sendOtpCodeFn) {
        await sendOtpCodeFn(normalizedEmail, slug);
      }
      return { mfaRequired: true, availableMethods: ['email'], message: 'OTP code has been sent to your email' };
    }

    return this.createSession(user, tenant, ipAddress, userAgent, createRefreshTokenFn);
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
    const result = await this.webauthnService.generateLoginOptions(email, tenantSlug);
    if (!result) throw new BadRequestException('Unable to generate passkey options');
    return result;
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
