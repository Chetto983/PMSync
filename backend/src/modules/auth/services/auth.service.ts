import { Injectable, Logger } from '@nestjs/common';
import { AuthRegistrationService } from './auth-registration.service';
import { AuthLoginService } from './auth-login.service';
import { AuthTokenService } from './auth-token.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { Request as ExpressRequest } from 'express';

/**
 * AuthService facade - delegates to focused sub-services.
 *
 * Phase 43: Split from 1376-line god-file into facade + 4 sub-services.
 * Preserves the same public API so no consumers need changes.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private registration: AuthRegistrationService,
    private loginService: AuthLoginService,
    private tokenService: AuthTokenService,
    private passwordResetService: AuthPasswordResetService,
  ) {}

  // ===== REGISTRATION =====

  async register(data: { email: string; password: string; firstName?: string; lastName?: string; tenantSlug?: string }) {
    return this.registration.register(data);
  }

  async sendOtpCode(email: string, tenantSlug?: string) {
    return this.registration.sendOtpCode(email, tenantSlug);
  }

  // ===== LOGIN / MFA =====

  async verifyOtpCode(email: string, code: string, tenantSlug?: string, ipAddress?: string, userAgent?: string) {
    return this.loginService.verifyOtpCode(email, code, tenantSlug, ipAddress, userAgent);
  }

  async login(
    email: string, password: string, tenantSlug?: string,
    ipAddress?: string, userAgent?: string, deviceToken?: string, request?: ExpressRequest,
  ) {
    return this.loginService.login(
      email, password, tenantSlug, ipAddress, userAgent, deviceToken, request,
      (e, s) => this.sendOtpCode(e, s),
      (uid, tid) => this.createRefreshToken(uid, tid),
    );
  }

  async loginWithPasskey(response: Record<string, unknown>, sessionId: string, ipAddress?: string, userAgent?: string) {
    return this.loginService.loginWithPasskey(
      response, sessionId, ipAddress, userAgent,
      (uid, tid) => this.createRefreshToken(uid, tid),
    );
  }

  async getWebAuthnLoginOptions(email: string, tenantSlug?: string) {
    return this.loginService.getWebAuthnLoginOptions(email, tenantSlug);
  }

  async verifyMfaChallenge(
    mfaToken: string, method: 'totp' | 'backup' | 'email', code: string,
    trustDevice: boolean = false, request?: ExpressRequest, ipAddress?: string, userAgent?: string,
  ) {
    return this.loginService.verifyMfaChallenge(
      mfaToken, method, code, trustDevice, request, ipAddress, userAgent,
      (uid, tid) => this.createRefreshToken(uid, tid),
    );
  }

  // ===== LOGOUT / TOKENS =====

  async logout(sessionId?: string | null, tenantId?: string | null, userId?: string | null) {
    return this.tokenService.logout(sessionId, tenantId, userId);
  }

  async createRefreshToken(userId: string, tenantId: string, familyId?: string) {
    return this.tokenService.createRefreshToken(userId, tenantId, familyId);
  }

  async rotateRefreshToken(rawToken: string) {
    return this.tokenService.rotateRefreshToken(rawToken);
  }

  async deleteAllRefreshTokens(userId: string, tenantId: string) {
    return this.tokenService.deleteAllRefreshTokens(userId, tenantId);
  }

  // ===== PROFILE =====

  async getCurrentUserProfile(userId: string, tenantId: string) {
    return this.tokenService.getCurrentUserProfile(userId, tenantId);
  }

  // ===== PASSWORD RESET =====

  async requestPasswordReset(email: string, tenantSlug?: string) {
    return this.passwordResetService.requestPasswordReset(email, tenantSlug);
  }

  async resetPassword(token: string, newPassword: string, tenantSlug?: string) {
    return this.passwordResetService.resetPassword(
      token, newPassword, tenantSlug,
      (uid, tid) => this.deleteAllRefreshTokens(uid, tid),
      (uid, tid) => this.tokenService.invalidateAllSessions(uid, tid),
    );
  }
}
