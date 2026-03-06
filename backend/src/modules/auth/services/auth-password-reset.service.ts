import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { EmailService } from '../../email/services/email.service';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordPolicyService } from './password-policy.service';

/**
 * Handles password reset request and execution flows.
 * Extracted from AuthService for maintainability.
 *
 * Phase 48 hardening:
 * - Dual-algo verify via PasswordHashingService for same-password check
 * - Argon2id hashing for new password
 * - Password policy validation before saving
 */
@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);

  private readonly passwordResetSecret: string;
  private readonly passwordResetTtlMs: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private passwordHashingService: PasswordHashingService,
    private passwordPolicyService: PasswordPolicyService,
  ) {
    const resetSecret = process.env.PASSWORD_RESET_SECRET;
    const jwtSecret = process.env.JWT_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!resetSecret || resetSecret.length < 32) {
      if (isProduction) {
        throw new Error(
          'SECURITY ERROR: PASSWORD_RESET_SECRET must be set and at least 32 characters in production. ' +
          'Generate one with: openssl rand -base64 32',
        );
      }
      this.logger.warn('PASSWORD_RESET_SECRET not set or too short. Using derived secret (development only).');
      this.passwordResetSecret = jwtSecret
        ? crypto.createHmac('sha256', jwtSecret).update('password-reset').digest('hex')
        : 'insecure-reset-secret';
    } else {
      this.passwordResetSecret = resetSecret;
    }

    this.passwordResetTtlMs = this.safeParseInt(process.env.PASSWORD_RESET_EXPIRATION, 15 * 60 * 1000);
  }

  private safeParseInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
    return parsed;
  }

  private hashResetToken(token: string): string {
    return crypto.createHmac('sha256', this.passwordResetSecret).update(token).digest('hex');
  }

  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string, tenantSlug?: string) {
    return withoutTenantScopingAsync(() => this._requestPasswordReset(email, tenantSlug));
  }

  private async _requestPasswordReset(email: string, tenantSlug?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      this.logger.warn(JSON.stringify({ event: 'password_reset_tenant_not_found', email: this.redactEmail(normalizedEmail) }));
      return { success: true, message: 'If an account exists with this email, a password reset link has been sent' };
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });
    if (!user) {
      this.logger.warn(JSON.stringify({ event: 'password_reset_user_not_found', email: this.redactEmail(normalizedEmail) }));
      return { success: true, message: 'If an account exists with this email, a password reset link has been sent' };
    }

    if (!user.isActive) {
      return { success: true, message: 'If an account exists with this email, a password reset link has been sent' };
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: { userEmail: normalizedEmail, tenantId: tenant.id },
    });

    const token = this.jwtService.sign(
      { email: user.email, type: 'password-reset', userId: user.id, tenantId: tenant.id },
      { secret: this.passwordResetSecret, expiresIn: '15m', algorithm: 'HS256' as any },
    );

    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + this.passwordResetTtlMs);

    await this.prisma.passwordResetToken.create({
      data: { userEmail: normalizedEmail, token: tokenHash, tenantId: tenant.id, expiresAt },
    });

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
    }

    this.logger.log(
      JSON.stringify({ event: 'password_reset_requested', email: this.redactEmail(normalizedEmail), tenantId: tenant.id }),
    );

    return { success: true, message: 'If an account exists with this email, a password reset link has been sent' };
  }

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    newPassword: string,
    _tenantSlug?: string,
    deleteAllRefreshTokensFn?: (userId: string, tenantId: string) => Promise<number>,
    invalidateAllSessionsFn?: (userId: string, tenantId: string) => Promise<{ sessionCount: number; cacheCount: number }>,
  ) {
    return withoutTenantScopingAsync(() => this._resetPassword(token, newPassword, _tenantSlug, deleteAllRefreshTokensFn, invalidateAllSessionsFn));
  }

  private async _resetPassword(
    token: string,
    newPassword: string,
    _tenantSlug?: string,
    deleteAllRefreshTokensFn?: (userId: string, tenantId: string) => Promise<number>,
    invalidateAllSessionsFn?: (userId: string, tenantId: string) => Promise<{ sessionCount: number; cacheCount: number }>,
  ) {
    let payload: { email: string; type: string; userId?: string; tenantId?: string };
    try {
      payload = this.jwtService.verify(token, { secret: this.passwordResetSecret, algorithms: ['HS256'] } as any);
    } catch (error) {
      this.logger.warn(JSON.stringify({
        event: 'password_reset_jwt_invalid',
        error: error instanceof Error ? error.message : String(error),
      }));
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.type !== 'password-reset') {
      this.logger.warn(JSON.stringify({ event: 'password_reset_wrong_token_type', type: payload.type }));
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashResetToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token: tokenHash } });

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      this.logger.warn(JSON.stringify({
        event: 'password_reset_token_invalid_or_expired',
        found: !!resetToken, isUsed: resetToken?.isUsed,
        expired: resetToken ? resetToken.expiresAt < new Date() : null,
      }));
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: resetToken.tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: resetToken.userEmail } },
    });
    if (!user) throw new BadRequestException('User not found');

    if (user.passwordHash) {
      const { valid: isSamePassword } = await this.passwordHashingService.verifyPassword(
        newPassword,
        user.passwordHash,
      );
      if (isSamePassword) {
        this.logger.warn(JSON.stringify({ event: 'password_reset_same_password', userId: user.id }));
        throw new BadRequestException('New password must be different from your current password');
      }
    }

    // Validate password policy before saving
    const policyResult = await this.passwordPolicyService.validate(newPassword);
    if (!policyResult.valid) {
      throw new BadRequestException(policyResult.errors.join('; '));
    }

    const passwordHash = await this.passwordHashingService.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { isUsed: true } });

    let sessionsInvalidated = 0;
    let cacheEntriesInvalidated = 0;
    if (invalidateAllSessionsFn) {
      const result = await invalidateAllSessionsFn(user.id, user.tenantId!);
      sessionsInvalidated = result.sessionCount;
      cacheEntriesInvalidated = result.cacheCount;
    }

    let refreshTokensInvalidated = 0;
    if (deleteAllRefreshTokensFn) {
      refreshTokensInvalidated = await deleteAllRefreshTokensFn(user.id, user.tenantId!);
    }

    this.logger.log(JSON.stringify({
      event: 'password_reset_completed', userId: user.id,
      email: this.redactEmail(user.email), sessionsInvalidated,
      refreshTokensInvalidated, cacheEntriesInvalidated,
    }));

    return { success: true, message: 'Password has been reset successfully. Please log in with your new password.' };
  }
}
