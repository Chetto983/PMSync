import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';

/**
 * OTP verification result
 */
export interface OtpVerifyResult {
  success: boolean;
  reason?: 'valid' | 'invalid' | 'expired' | 'already_used' | 'rate_limited' | 'locked_out';
  attemptsRemaining?: number;
  lockoutEndsAt?: Date;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  attemptsRemaining: number;
  resetAt: Date;
  lockoutEndsAt?: Date;
}

/**
 * Stored OTP data (Redis)
 */
interface StoredOtp {
  hash: string;
  salt: string;
  expiresAt: number;
  isUsed: boolean;
  type: 'email' | 'sms';
}

/**
 * OtpSecurityService - Secure OTP handling with hashing and rate limiting
 *
 * SCALABLE: Uses Redis for distributed state (works across multiple instances)
 *
 * Security features:
 * - HMAC-SHA256 hashed OTP storage (not plaintext)
 * - Per-user rate limiting with lockout (Redis-based)
 * - Attempt tracking for brute force protection
 * - Redis storage with TTL for automatic expiration
 *
 * Best practices applied:
 * - OTPs are hashed before storage per OWASP recommendations
 * - Rate limiting prevents brute force attacks
 * - Lockout after N failed attempts per NIST 800-63b
 * - Redis TTL for automatic cleanup (no memory leaks)
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
 */
@Injectable()
export class OtpSecurityService implements OnModuleInit {
  private readonly logger = new Logger(OtpSecurityService.name);
  private redis!: Redis;

  // Configuration
  private readonly otpExpirationMs: number;
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimitMax: number;
  private readonly hmacSecret: string;

  // Redis key prefixes
  private readonly KEY_PREFIX_OTP = 'otp:store:';
  private readonly KEY_PREFIX_RATE_LIMIT = 'otp:ratelimit:';
  private readonly KEY_PREFIX_ATTEMPTS = 'otp:attempts:';
  private readonly KEY_PREFIX_LOCKOUT = 'otp:lockout:';

  constructor(
    private readonly config: ConfigService,
    private readonly redisConnection: RedisConnectionService,
  ) {
    // Get HMAC secret for OTP hashing (derived from JWT secret if not set)
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    const otpSecret = this.config.get<string>('OTP_HMAC_SECRET');
    if (!otpSecret && (!jwtSecret || jwtSecret === 'secret')) {
      this.logger.warn(
        'OTP_HMAC_SECRET not set and JWT_SECRET is weak. Using fallback - NOT SECURE FOR PRODUCTION.',
      );
      this.hmacSecret = 'insecure-otp-secret-change-me';
    } else {
      this.hmacSecret = otpSecret || this.deriveSecret(jwtSecret!, 'otp-hmac');
    }

    // Configuration with safe defaults
    this.otpExpirationMs = this.safeParseInt(this.config.get<string>('OTP_EXPIRATION'), 5 * 60 * 1000); // 5 min
    this.maxAttempts = this.safeParseInt(this.config.get<string>('OTP_MAX_ATTEMPTS'), 5);
    this.lockoutDurationMs = this.safeParseInt(this.config.get<string>('OTP_LOCKOUT_DURATION'), 15 * 60 * 1000);
    this.rateLimitWindowMs = this.safeParseInt(this.config.get<string>('OTP_RATE_LIMIT_WINDOW'), 60 * 1000);
    this.rateLimitMax = this.safeParseInt(this.config.get<string>('OTP_RATE_LIMIT_MAX'), 3);
  }

  onModuleInit() {
    this.redis = this.redisConnection.client;
  }

  /**
   * Generate a cryptographically secure 6-digit OTP
   */
  generateOtp(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);
    return crypto.randomInt(min, max).toString();
  }

  /**
   * Hash OTP code using HMAC-SHA256
   *
   * We use HMAC instead of bcrypt because:
   * 1. OTPs are short-lived (5 min)
   * 2. We need fast verification for UX
   * 3. Rate limiting provides brute force protection
   */
  hashOtp(code: string, salt: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${code}:${salt}`)
      .digest('hex');
  }

  /**
   * Verify OTP code against hash
   */
  verifyOtpHash(code: string, salt: string, hash: string): boolean {
    const computed = this.hashOtp(code, salt);
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  /**
   * Create and store hashed OTP for a user (Redis)
   */
  async createOtp(
    userId: string,
    type: 'email' | 'sms' = 'email',
  ): Promise<{ code: string; expiresAt: Date }> {
    // Check rate limit first
    const rateLimitKey = `otp-send:${userId}`;
    const rateLimit = await this.checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_rate_limited',
          userId,
          type,
          resetAt: rateLimit.resetAt.toISOString(),
        }),
      );
      throw new Error(`Rate limited. Try again in ${Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)} seconds.`);
    }

    // Generate OTP and salt
    const code = this.generateOtp();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashOtp(code, salt);
    const expiresAt = new Date(Date.now() + this.otpExpirationMs);

    // Store in Redis with TTL (overwrite any previous OTP)
    const storeKey = `${this.KEY_PREFIX_OTP}${userId}:${type}`;
    const otpData: StoredOtp = {
      hash,
      salt,
      expiresAt: expiresAt.getTime(),
      isUsed: false,
      type,
    };

    const ttlSeconds = Math.ceil(this.otpExpirationMs / 1000);
    await this.redis.setex(storeKey, ttlSeconds, JSON.stringify(otpData));

    this.logger.log(
      JSON.stringify({
        event: 'otp_created',
        userId,
        type,
        expiresAt: expiresAt.toISOString(),
      }),
    );

    // Return plaintext code (to send via email/SMS)
    return { code, expiresAt };
  }

  /**
   * Verify OTP code with rate limiting and lockout
   */
  async verifyOtp(
    userId: string,
    code: string,
    type: 'email' | 'sms' = 'email',
  ): Promise<OtpVerifyResult> {
    // Check for lockout
    const lockoutKey = `${this.KEY_PREFIX_LOCKOUT}${userId}`;
    const lockoutTtl = await this.redis.ttl(lockoutKey);
    if (lockoutTtl > 0) {
      const lockoutEndsAt = new Date(Date.now() + lockoutTtl * 1000);
      this.logger.warn(
        JSON.stringify({
          event: 'otp_locked_out',
          userId,
          lockoutEndsAt: lockoutEndsAt.toISOString(),
        }),
      );
      return {
        success: false,
        reason: 'locked_out',
        lockoutEndsAt,
      };
    }

    // Find valid OTP record
    const storeKey = `${this.KEY_PREFIX_OTP}${userId}:${type}`;
    const otpJson = await this.redis.get(storeKey);

    if (!otpJson) {
      await this.recordFailedAttempt(userId);
      return {
        success: false,
        reason: 'invalid',
        attemptsRemaining: await this.getAttemptsRemaining(userId),
      };
    }

    const otpRecord: StoredOtp = JSON.parse(otpJson);

    if (otpRecord.isUsed) {
      await this.recordFailedAttempt(userId);
      return {
        success: false,
        reason: 'already_used',
        attemptsRemaining: await this.getAttemptsRemaining(userId),
      };
    }

    if (otpRecord.expiresAt < Date.now()) {
      await this.recordFailedAttempt(userId);
      return {
        success: false,
        reason: 'expired',
        attemptsRemaining: await this.getAttemptsRemaining(userId),
      };
    }

    // Verify OTP
    const isValid = this.verifyOtpHash(code, otpRecord.salt, otpRecord.hash);

    if (!isValid) {
      const attemptsRemaining = await this.recordFailedAttempt(userId);

      // Check if should lock out
      if (attemptsRemaining === 0) {
        const lockoutSeconds = Math.ceil(this.lockoutDurationMs / 1000);
        await this.redis.setex(lockoutKey, lockoutSeconds, '1');
        this.logger.warn(
          JSON.stringify({
            event: 'otp_lockout_triggered',
            userId,
            lockoutDuration: this.lockoutDurationMs,
          }),
        );
      }

      return {
        success: false,
        reason: 'invalid',
        attemptsRemaining,
      };
    }

    // Mark OTP as used (update in Redis)
    otpRecord.isUsed = true;
    const remainingTtl = await this.redis.ttl(storeKey);
    if (remainingTtl > 0) {
      await this.redis.setex(storeKey, remainingTtl, JSON.stringify(otpRecord));
    }

    // Clear failed attempts on success
    await this.redis.del(`${this.KEY_PREFIX_ATTEMPTS}${userId}`);

    this.logger.log(
      JSON.stringify({
        event: 'otp_verified',
        userId,
        type,
      }),
    );

    return { success: true, reason: 'valid' };
  }

  /**
   * Check rate limit for an action (Redis-based)
   */
  async checkRateLimit(key: string): Promise<RateLimitResult> {
    const redisKey = `${this.KEY_PREFIX_RATE_LIMIT}${key}`;
    const now = Date.now();

    try {
      // Increment counter
      const count = await this.redis.incr(redisKey);

      // Set TTL on first request
      if (count === 1) {
        const ttlSeconds = Math.ceil(this.rateLimitWindowMs / 1000);
        await this.redis.expire(redisKey, ttlSeconds);
      }

      // Get TTL for reset time
      const ttl = await this.redis.ttl(redisKey);
      const resetAt = new Date(now + Math.max(ttl, 0) * 1000);

      if (count > this.rateLimitMax) {
        return {
          allowed: false,
          attemptsRemaining: 0,
          resetAt,
        };
      }

      return {
        allowed: true,
        attemptsRemaining: this.rateLimitMax - count,
        resetAt,
      };
    } catch (error) {
      // SECURITY: Fail CLOSED on Redis error — deny the request
      // This prevents brute force attacks when Redis is unavailable
      this.logger.error(`Rate limit check failed (denying request): ${error instanceof Error ? error.message : String(error)}`);
      return {
        allowed: false,
        attemptsRemaining: 0,
        resetAt: new Date(now + this.rateLimitWindowMs),
      };
    }
  }

  /**
   * Record a failed OTP attempt (Redis-based)
   */
  private async recordFailedAttempt(userId: string): Promise<number> {
    const key = `${this.KEY_PREFIX_ATTEMPTS}${userId}`;
    const ttlSeconds = Math.ceil(this.lockoutDurationMs / 1000);

    try {
      // Increment attempts
      const count = await this.redis.incr(key);

      // Set TTL on first attempt
      if (count === 1) {
        await this.redis.expire(key, ttlSeconds);
      }

      return Math.max(0, this.maxAttempts - count);
    } catch (error) {
      this.logger.error(`Failed attempt recording error: ${error instanceof Error ? error.message : String(error)}`);
      return this.maxAttempts - 1;
    }
  }

  /**
   * Get remaining attempts for a user
   */
  private async getAttemptsRemaining(userId: string): Promise<number> {
    const key = `${this.KEY_PREFIX_ATTEMPTS}${userId}`;

    try {
      const countStr = await this.redis.get(key);
      if (!countStr) return this.maxAttempts;
      const count = parseInt(countStr, 10);
      return Math.max(0, this.maxAttempts - count);
    } catch (error) {
      this.logger.error(`Get attempts error: ${error instanceof Error ? error.message : String(error)}`);
      return this.maxAttempts;
    }
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
   * Derive a secret using HMAC
   */
  private deriveSecret(masterSecret: string, purpose: string): string {
    return crypto
      .createHmac('sha256', masterSecret)
      .update(purpose)
      .digest('hex');
  }

  /**
   * Clear all OTP data for a user (for testing/admin)
   */
  async clearUserOtpData(userId: string): Promise<void> {
    const keys = [
      `${this.KEY_PREFIX_OTP}${userId}:email`,
      `${this.KEY_PREFIX_OTP}${userId}:sms`,
      `${this.KEY_PREFIX_RATE_LIMIT}otp-send:${userId}`,
      `${this.KEY_PREFIX_ATTEMPTS}${userId}`,
      `${this.KEY_PREFIX_LOCKOUT}${userId}`,
    ];

    await this.redis.del(...keys);
  }
}
