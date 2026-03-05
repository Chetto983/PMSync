import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Validated auth configuration with fail-fast on missing required values
 *
 * Security best practices applied:
 * - Separate secrets for different token types (access, refresh, password-reset)
 * - Short-lived access tokens (15 min) per 2025 recommendations
 * - NaN-safe expiration parsing with sensible defaults
 * - Algorithm specification for JWT signing
 *
 * @see https://jwt.app/blog/jwt-best-practices/
 * @see AUTH_MODULE_ROADMAP.md Phase 1 - Config and Token Safety
 */
@Injectable()
export class AuthConfigService implements OnModuleInit {
  private readonly logger = new Logger(AuthConfigService.name);

  // JWT Access Token Configuration
  readonly jwtSecret: string;
  readonly jwtAlgorithm: string = 'HS256';
  readonly jwtIssuer: string = 'pmsync-auth';
  readonly jwtAudience: string = 'pmsync-api';
  readonly accessTokenExpiresIn: string;
  readonly accessTokenTtlMs: number;

  // ES256 Asymmetric Signing (2026 best practice)
  readonly jwtPrivateKey?: string;
  readonly jwtPublicKey?: string;
  readonly jwtLegacyHmacSecret?: string;
  readonly jwtKeyId?: string;
  readonly isEs256Enabled: boolean;

  // Refresh Token Configuration (for future implementation)
  readonly refreshTokenSecret: string;
  readonly refreshTokenExpiresIn: string = '7d';

  // Password Reset Token Configuration
  readonly passwordResetSecret: string;
  readonly passwordResetExpiresIn: string;
  readonly passwordResetTtlMs: number;

  // OTP Configuration
  readonly otpExpirationMs: number;
  readonly otpLength: number = 6;
  readonly otpMaxAttempts: number;
  readonly otpLockoutDurationMs: number;

  // Session Configuration
  readonly sessionTtlMs: number;
  readonly maxSessionsPerUser: number;

  // Rate Limiting Configuration
  readonly loginRateLimitWindow: number;
  readonly loginRateLimitMax: number;
  readonly otpRateLimitWindow: number;
  readonly otpRateLimitMax: number;

  constructor(private readonly config: ConfigService) {
    // === REQUIRED: JWT Secret (fail fast if missing) ===
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'secret' || jwtSecret.length < 32) {
      throw new Error(
        'FATAL: JWT_SECRET is missing, too short (<32 chars), or using unsafe default. ' +
          'Set a secure JWT_SECRET environment variable (min 32 characters).',
      );
    }
    this.jwtSecret = jwtSecret;

    // === ES256 Asymmetric Signing Setup ===
    const privateKeyRaw = this.config.get<string>('JWT_PRIVATE_KEY');
    const publicKeyRaw = this.config.get<string>('JWT_PUBLIC_KEY');
    const privateKeyPem = privateKeyRaw?.replace(/\\n/g, '\n');
    const publicKeyPem = publicKeyRaw?.replace(/\\n/g, '\n');

    if (privateKeyPem && publicKeyPem) {
      this.jwtPrivateKey = privateKeyPem;
      this.jwtPublicKey = publicKeyPem;
      this.isEs256Enabled = true;
      this.jwtAlgorithm = 'ES256';
      this.jwtKeyId = crypto
        .createHash('sha256')
        .update(publicKeyPem)
        .digest('hex')
        .substring(0, 8);

      // Grace period: legacy HMAC secret for accepting old HS256 tokens
      const legacyHmac = this.config.get<string>('JWT_LEGACY_HMAC_SECRET');
      this.jwtLegacyHmacSecret = legacyHmac || jwtSecret;
    } else {
      this.isEs256Enabled = false;
    }

    // === REQUIRED: Password Reset Secret (fail fast if missing) ===
    // Must be different from JWT secret for security
    const passwordResetSecret = this.config.get<string>('PASSWORD_RESET_SECRET');
    if (!passwordResetSecret || passwordResetSecret.length < 32) {
      throw new Error(
        'FATAL: PASSWORD_RESET_SECRET is missing or too short (<32 chars). ' +
          'Set a secure PASSWORD_RESET_SECRET environment variable.',
      );
    }
    if (passwordResetSecret === jwtSecret) {
      throw new Error(
        'FATAL: PASSWORD_RESET_SECRET must be different from JWT_SECRET for security.',
      );
    }
    this.passwordResetSecret = passwordResetSecret;

    // === REQUIRED: Refresh Token Secret (for future use) ===
    const refreshTokenSecret = this.config.get<string>('REFRESH_TOKEN_SECRET');
    if (!refreshTokenSecret || refreshTokenSecret.length < 32) {
      // Fall back to derived secret for backwards compatibility
      this.refreshTokenSecret = this.deriveSecret(jwtSecret, 'refresh');
      this.logger.warn(
        'REFRESH_TOKEN_SECRET not set; using derived secret. ' +
          'Set REFRESH_TOKEN_SECRET for production.',
      );
    } else {
      this.refreshTokenSecret = refreshTokenSecret;
    }

    // === Access Token TTL (default: 15 minutes per 2025 best practices) ===
    this.accessTokenExpiresIn = this.config.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '15m';
    this.accessTokenTtlMs = this.parseExpirationToMs(
      this.accessTokenExpiresIn,
      15 * 60 * 1000, // 15 minutes default
    );

    // === Password Reset TTL (default: 15 minutes) ===
    const resetExpiration = this.config.get<string>('PASSWORD_RESET_EXPIRATION');
    this.passwordResetExpiresIn = resetExpiration || '15m';
    this.passwordResetTtlMs = this.safeParseInt(
      resetExpiration,
      15 * 60 * 1000, // 15 minutes default
    );

    // === OTP Configuration ===
    this.otpExpirationMs = this.safeParseInt(
      this.config.get<string>('OTP_EXPIRATION'),
      5 * 60 * 1000, // 5 minutes default (shorter for security)
    );
    this.otpMaxAttempts = this.safeParseInt(
      this.config.get<string>('OTP_MAX_ATTEMPTS'),
      5,
    );
    this.otpLockoutDurationMs = this.safeParseInt(
      this.config.get<string>('OTP_LOCKOUT_DURATION'),
      15 * 60 * 1000, // 15 minutes lockout
    );

    // === Session Configuration ===
    this.sessionTtlMs = this.safeParseInt(
      this.config.get<string>('SESSION_TTL'),
      24 * 60 * 60 * 1000, // 24 hours default
    );
    this.maxSessionsPerUser = this.safeParseInt(
      this.config.get<string>('MAX_SESSIONS_PER_USER'),
      5,
    );

    // === Rate Limiting Configuration ===
    this.loginRateLimitWindow = this.safeParseInt(
      this.config.get<string>('LOGIN_RATE_LIMIT_WINDOW'),
      15 * 60 * 1000, // 15 minutes
    );
    this.loginRateLimitMax = this.safeParseInt(
      this.config.get<string>('LOGIN_RATE_LIMIT_MAX'),
      10, // 10 attempts per 15 minutes
    );
    this.otpRateLimitWindow = this.safeParseInt(
      this.config.get<string>('OTP_RATE_LIMIT_WINDOW'),
      60 * 1000, // 1 minute
    );
    this.otpRateLimitMax = this.safeParseInt(
      this.config.get<string>('OTP_RATE_LIMIT_MAX'),
      3, // 3 OTP sends per minute
    );
  }

  /**
   * Validate configuration on module init
   */
  onModuleInit() {
    this.logger.log('Auth configuration validated successfully');
    this.logger.log(
      JSON.stringify({
        event: 'auth_config_loaded',
        jwtAlgorithm: this.jwtAlgorithm,
        isEs256Enabled: this.isEs256Enabled,
        jwtKeyId: this.jwtKeyId ?? null,
        hasLegacyHmacSecret: !!this.jwtLegacyHmacSecret,
        accessTokenTtl: this.accessTokenExpiresIn,
        passwordResetTtl: this.passwordResetExpiresIn,
        otpExpirationMs: this.otpExpirationMs,
        otpMaxAttempts: this.otpMaxAttempts,
        sessionTtlMs: this.sessionTtlMs,
        maxSessionsPerUser: this.maxSessionsPerUser,
      }),
    );
    if (this.isEs256Enabled && this.jwtLegacyHmacSecret) {
      this.logger.warn(
        'JWT grace period active: accepting both HS256 and ES256 tokens. ' +
          'Remove JWT_LEGACY_HMAC_SECRET after migration.',
      );
    }
  }

  /**
   * Safely parse integer with NaN protection
   *
   * @param value - String value to parse
   * @param defaultValue - Default value if parsing fails or NaN
   * @returns Parsed integer or default
   */
  private safeParseInt(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || !isFinite(parsed)) {
      this.logger.warn(
        `Invalid numeric config value "${value}", using default: ${defaultValue}`,
      );
      return defaultValue;
    }
    return parsed;
  }

  /**
   * Parse expiration string (e.g., "15m", "1h", "7d") to milliseconds
   */
  private parseExpirationToMs(value: string, defaultMs: number): number {
    if (!value) return defaultMs;

    // Handle numeric strings (assumed to be milliseconds)
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue) && value === String(numericValue)) {
      return numericValue;
    }

    // Parse time strings like "15m", "1h", "7d"
    const match = value.match(/^(\d+)([smhd])$/i);
    if (!match) {
      this.logger.warn(
        `Invalid expiration format "${value}", using default: ${defaultMs}ms`,
      );
      return defaultMs;
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        return amount * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      default:
        return defaultMs;
    }
  }

  /**
   * Derive a secret from a master secret using HMAC
   * Used for backwards compatibility when separate secrets not configured
   */
  private deriveSecret(masterSecret: string, purpose: string): string {
    return crypto
      .createHmac('sha256', masterSecret)
      .update(purpose)
      .digest('hex');
  }

  /**
   * Get JWT sign options for access tokens
   */
  getAccessTokenOptions() {
    if (this.isEs256Enabled) {
      return {
        algorithm: 'ES256' as const,
        expiresIn: this.accessTokenExpiresIn,
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      };
    }
    return {
      secret: this.jwtSecret,
      expiresIn: this.accessTokenExpiresIn,
      algorithm: this.jwtAlgorithm as any,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
    };
  }

  /**
   * Get JWT sign options for password reset tokens
   */
  getPasswordResetTokenOptions() {
    return {
      secret: this.passwordResetSecret,
      expiresIn: this.passwordResetExpiresIn,
      algorithm: 'HS256' as const,
      issuer: this.jwtIssuer,
      audience: 'password-reset',
    };
  }
}
