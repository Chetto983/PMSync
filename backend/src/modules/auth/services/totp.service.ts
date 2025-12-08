import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { getRedisConnectionOptions } from '../../../config/configuration';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

/**
 * TOTP setup result
 */
export interface TotpSetupResult {
  /** Base32 secret (for manual entry in authenticator app) */
  secret: string;
  /** QR code as data URL (base64 PNG) */
  qrCodeDataUrl: string;
  /** otpauth:// URI for the QR code */
  otpauthUrl: string;
}

/**
 * TOTP verification result
 */
export interface TotpVerifyResult {
  success: boolean;
  reason?: 'valid' | 'invalid' | 'not_enabled' | 'not_setup' | 'replay';
}

/**
 * TotpService - Time-based One-Time Password for authenticator apps
 *
 * SCALABLE: Uses Redis for replay attack prevention (works across multiple instances)
 *
 * Implements RFC 6238 TOTP using:
 * - Google Authenticator compatible settings (6 digits, 30s period, SHA1)
 * - AES-256-GCM encrypted secret storage
 * - QR code generation for easy setup
 * - Redis-based replay attack prevention
 *
 * Supported authenticator apps:
 * - Google Authenticator
 * - Microsoft Authenticator
 * - Authy
 * - 1Password
 * - Any RFC 6238 compliant app
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6238
 * @see MFA_ENHANCEMENT_ROADMAP.md Phase 1
 */
@Injectable()
export class TotpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TotpService.name);
  private redis!: Redis;

  // TOTP configuration
  private readonly issuer: string;
  private readonly digits: number;
  private readonly period: number;
  private readonly window: number;

  // Encryption key for secrets (derived from JWT_SECRET)
  private readonly encryptionKey: Buffer;

  // Redis key prefix for used codes
  private readonly KEY_PREFIX_USED_CODE = 'totp:used:';

  // Code expiry (60 seconds = 2 time windows)
  private readonly codeExpirySeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Configure otplib
    this.issuer = this.config.get<string>('TOTP_ISSUER') || 'PMSync';
    this.digits = parseInt(this.config.get<string>('TOTP_DIGITS') || '6', 10);
    this.period = parseInt(this.config.get<string>('TOTP_PERIOD') || '30', 10);
    this.window = parseInt(this.config.get<string>('TOTP_WINDOW') || '1', 10);

    // Derive encryption key from JWT_SECRET
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'secret' || jwtSecret.length < 32) {
      this.logger.warn('JWT_SECRET is weak. TOTP secrets will use fallback encryption - NOT SECURE FOR PRODUCTION.');
      this.encryptionKey = crypto.scryptSync('insecure-totp-key', 'salt', 32);
    } else {
      this.encryptionKey = crypto.scryptSync(jwtSecret, 'totp-encryption', 32);
    }

    // Configure authenticator options (SHA1 is standard for Google Authenticator compatibility)
    authenticator.options = {
      digits: this.digits,
      step: this.period,
      window: this.window,
    };
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'totp',
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis TOTP service error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis TOTP service connected');
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }

  /**
   * Generate TOTP secret and QR code for setup
   *
   * @param userId - User ID to generate secret for
   * @param email - User email (displayed in authenticator app)
   * @returns Secret, QR code data URL, and otpauth URL
   */
  async generateSecret(userId: string, email: string): Promise<TotpSetupResult> {
    // Generate random secret (Base32 encoded)
    const secret = authenticator.generateSecret(20); // 160 bits

    // Create otpauth URL for QR code
    const otpauthUrl = authenticator.keyuri(email, this.issuer, secret);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 256,
    });

    // Encrypt secret before storage
    const { encrypted, iv } = this.encryptSecret(secret);

    // Store encrypted secret (not yet enabled)
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      update: {
        secret: encrypted,
        encryptionIv: iv,
        isEnabled: false,
        verifiedAt: null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        secret: encrypted,
        encryptionIv: iv,
        isEnabled: false,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'totp_secret_generated',
        userId,
        email: this.redactEmail(email),
      }),
    );

    return {
      secret,
      qrCodeDataUrl,
      otpauthUrl,
    };
  }

  /**
   * Verify TOTP code and activate if not yet enabled
   *
   * @param userId - User ID
   * @param code - 6-digit TOTP code from authenticator app
   * @returns Verification result
   */
  async verifyAndActivate(userId: string, code: string): Promise<TotpVerifyResult> {
    const mfaSecret = await this.prisma.mfaSecret.findUnique({
      where: { userId },
    });

    if (!mfaSecret) {
      return { success: false, reason: 'not_setup' };
    }

    // Decrypt secret
    const secret = this.decryptSecret(mfaSecret.secret, mfaSecret.encryptionIv);

    // Verify code with time window tolerance
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      this.logger.warn(
        JSON.stringify({
          event: 'totp_verification_failed',
          userId,
          isActivation: !mfaSecret.isEnabled,
        }),
      );
      return { success: false, reason: 'invalid' };
    }

    // If not yet enabled, activate TOTP
    if (!mfaSecret.isEnabled) {
      await this.prisma.mfaSecret.update({
        where: { userId },
        data: {
          isEnabled: true,
          verifiedAt: new Date(),
        },
      });

      // Also enable MFA on user record
      await this.prisma.user.update({
        where: { id: userId },
        data: { isMfaEnabled: true },
      });

      this.logger.log(
        JSON.stringify({
          event: 'totp_activated',
          userId,
        }),
      );
    }

    return { success: true, reason: 'valid' };
  }

  /**
   * Verify TOTP code (for login)
   *
   * @param userId - User ID
   * @param code - 6-digit TOTP code
   * @returns Verification result
   */
  async verifyCode(userId: string, code: string): Promise<TotpVerifyResult> {
    const mfaSecret = await this.prisma.mfaSecret.findUnique({
      where: { userId },
    });

    if (!mfaSecret) {
      return { success: false, reason: 'not_setup' };
    }

    if (!mfaSecret.isEnabled) {
      return { success: false, reason: 'not_enabled' };
    }

    // Check for replay attack (Redis-based)
    if (await this.isCodeUsed(userId, code)) {
      this.logger.warn(
        JSON.stringify({
          event: 'totp_replay_attack_detected',
          userId,
        }),
      );
      return { success: false, reason: 'replay' };
    }

    // Decrypt secret
    const secret = this.decryptSecret(mfaSecret.secret, mfaSecret.encryptionIv);

    // Verify code with time window tolerance
    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      this.logger.warn(
        JSON.stringify({
          event: 'totp_login_verification_failed',
          userId,
        }),
      );
      return { success: false, reason: 'invalid' };
    }

    // Mark code as used to prevent replay attacks (Redis-based)
    await this.markCodeAsUsed(userId, code);

    this.logger.log(
      JSON.stringify({
        event: 'totp_verified',
        userId,
      }),
    );

    return { success: true, reason: 'valid' };
  }

  /**
   * Check if TOTP is enabled for a user
   */
  async isEnabled(userId: string): Promise<boolean> {
    const mfaSecret = await this.prisma.mfaSecret.findUnique({
      where: { userId },
      select: { isEnabled: true },
    });

    return mfaSecret?.isEnabled ?? false;
  }

  /**
   * Disable TOTP for a user
   */
  async disable(userId: string): Promise<void> {
    await this.prisma.mfaSecret.delete({
      where: { userId },
    }).catch(() => {
      // Already deleted
    });

    this.logger.log(
      JSON.stringify({
        event: 'totp_disabled',
        userId,
      }),
    );
  }

  /**
   * Encrypt secret using AES-256-GCM
   */
  private encryptSecret(secret: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine encrypted data and auth tag
    return {
      encrypted: encrypted + ':' + authTag.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt secret using AES-256-GCM
   */
  private decryptSecret(encrypted: string, iv: string): string {
    const [encryptedData, authTagHex] = encrypted.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'hex'),
    );

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Redact email for logging
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  // ==================== REPLAY ATTACK PREVENTION (Redis-based) ====================

  /**
   * Check if a code has already been used within the expiry window
   *
   * @param userId - User ID
   * @param code - TOTP code to check
   * @returns true if code was already used
   */
  private async isCodeUsed(userId: string, code: string): Promise<boolean> {
    const key = `${this.KEY_PREFIX_USED_CODE}${userId}:${code}`;
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      // On Redis error, allow the request (fail open for availability)
      this.logger.error(`Redis TOTP used code check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Mark a code as used to prevent replay attacks
   *
   * @param userId - User ID
   * @param code - TOTP code to mark as used
   */
  private async markCodeAsUsed(userId: string, code: string): Promise<void> {
    const key = `${this.KEY_PREFIX_USED_CODE}${userId}:${code}`;
    try {
      await this.redis.setex(key, this.codeExpirySeconds, '1');
    } catch (error) {
      // Log but don't fail - security degraded but service available
      this.logger.error(`Redis TOTP mark code failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear all used codes for a user (for testing/admin)
   */
  async clearUsedCodes(userId: string): Promise<void> {
    try {
      const pattern = `${this.KEY_PREFIX_USED_CODE}${userId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Redis TOTP clear codes failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
