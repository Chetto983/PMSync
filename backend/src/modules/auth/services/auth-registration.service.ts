import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { EmailService } from '../../email/services/email.service';
import { OtpSecurityService } from './otp-security.service';
import { LegalAcceptanceService } from '../../compliance/services/legal-acceptance.service';

/**
 * Handles user registration and OTP send/verify flows.
 * Extracted from AuthService for maintainability.
 */
@Injectable()
export class AuthRegistrationService {
  private readonly logger = new Logger(AuthRegistrationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private otpSecurity: OtpSecurityService,
    private legalAcceptanceService: LegalAcceptanceService,
  ) {}

  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Register a new user
   */
  async register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    tenantSlug?: string;
  }) {
    // Auth runs pre-login: no tenant context in AsyncLocalStorage yet
    return withoutTenantScopingAsync(() => this._register(data));
  }

  private async _register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    tenantSlug?: string;
  }) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const slug = data.tenantSlug?.toLowerCase() || normalizedEmail;

    let tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    let isNewTenant = false;

    if (!tenant) {
      const tenantName = data.firstName
        ? `${data.firstName}'s Workspace`
        : `${normalizedEmail.split('@')[0]}'s Workspace`;

      tenant = await this.prisma.tenant.create({
        data: { slug, name: tenantName, isActive: true },
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

    if (!tenant.isActive) {
      this.logger.warn(
        JSON.stringify({ event: 'register_tenant_inactive', tenantId: tenant.id }),
      );
      throw new ForbiddenException('Registration is not available for this organization');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (existingUser) {
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

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        isMfaEnabled: true,
        isActive: true,
        role: isNewTenant ? 'admin' : 'user',
      },
    });

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
   */
  async sendOtpCode(email: string, tenantSlug?: string) {
    // Auth runs pre-login: no tenant context in AsyncLocalStorage yet
    return withoutTenantScopingAsync(() => this._sendOtpCode(email, tenantSlug));
  }

  private async _sendOtpCode(email: string, tenantSlug?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const slug = (tenantSlug || normalizedEmail).toLowerCase();

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });

    if (!tenant) {
      this.logger.warn(
        JSON.stringify({ event: 'otp_tenant_not_found', email: this.redactEmail(normalizedEmail) }),
      );
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    if (!tenant.isActive) {
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
    });

    if (!user) {
      this.logger.warn(
        JSON.stringify({ event: 'otp_user_not_found', email: this.redactEmail(normalizedEmail) }),
      );
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    if (!user.isActive) {
      return { success: true, message: 'If the email exists, an OTP has been sent' };
    }

    try {
      const { code } = await this.otpSecurity.createOtp(user.id, 'email');
      await this.emailService.sendOtp(user.email, code);
      this.logger.log(
        JSON.stringify({ event: 'otp_sent', userId: user.id, email: this.redactEmail(user.email) }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_send_failed',
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return { success: true, message: 'If the email exists, an OTP has been sent' };
  }
}
