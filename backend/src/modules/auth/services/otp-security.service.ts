import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

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
 * Stored OTP data (in-memory)
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
 * Security features:
 * - HMAC-SHA256 hashed OTP storage (not plaintext)
 * - Per-user rate limiting with lockout
 * - Attempt tracking for brute force protection
 * - In-memory storage for short-lived OTPs
 *
 * Best practices applied:
 * - OTPs are hashed before storage per OWASP recommendations
 * - Rate limiting prevents brute force attacks
 * - Lockout after N failed attempts per NIST 800-63b
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
 */
@Injectable()
export class OtpSecurityService {
  private readonly logger = new Logger(OtpSecurityService.name);

  // Configuration
  private readonly otpExpirationMs: number;
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimitMax: number;
  private readonly hmacSecret: string;

  // In-memory stores
  private otpStore: Map<string, StoredOtp> = new Map(); // userId:type -> OTP data
  private rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();
  private attemptStore: Map<string, { count: number; firstAttemptAt: number }> = new Map();
  private lockoutStore: Map<string, number> = new Map();

  constructor() {
    // Get HMAC secret for OTP hashing (derived from JWT secret if not set)
    const jwtSecret = process.env.JWT_SECRET;
    const otpSecret = process.env.OTP_HMAC_SECRET;
    if (!otpSecret && (!jwtSecret || jwtSecret === 'secret')) {
      this.logger.warn(
        'OTP_HMAC_SECRET not set and JWT_SECRET is weak. Using fallback - NOT SECURE FOR PRODUCTION.',
      );
      this.hmacSecret = 'insecure-otp-secret-change-me';
    } else {
      this.hmacSecret = otpSecret || this.deriveSecret(jwtSecret!, 'otp-hmac');
    }

    // Configuration with safe defaults
    this.otpExpirationMs = this.safeParseInt(process.env.OTP_EXPIRATION, 5 * 60 * 1000); // 5 min
    this.maxAttempts = this.safeParseInt(process.env.OTP_MAX_ATTEMPTS, 5);
    this.lockoutDurationMs = this.safeParseInt(process.env.OTP_LOCKOUT_DURATION, 15 * 60 * 1000);
    this.rateLimitWindowMs = this.safeParseInt(process.env.OTP_RATE_LIMIT_WINDOW, 60 * 1000);
    this.rateLimitMax = this.safeParseInt(process.env.OTP_RATE_LIMIT_MAX, 3);

    // Periodic cleanup of expired entries (every 5 minutes)
    setInterval(() => this.cleanupExpiredEntries(), 5 * 60 * 1000);
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
   * Create and store hashed OTP for a user (in-memory)
   */
  async createOtp(
    userId: string,
    type: 'email' | 'sms' = 'email',
  ): Promise<{ code: string; expiresAt: Date }> {
    // Check rate limit first
    const rateLimitKey = `otp-send:${userId}`;
    const rateLimit = this.checkRateLimit(rateLimitKey);
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

    // Store in-memory (overwrite any previous OTP)
    const storeKey = `${userId}:${type}`;
    this.otpStore.set(storeKey, {
      hash,
      salt,
      expiresAt: expiresAt.getTime(),
      isUsed: false,
      type,
    });

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
    const lockoutKey = `otp-lockout:${userId}`;
    const lockoutEndsAt = this.lockoutStore.get(lockoutKey);
    if (lockoutEndsAt && lockoutEndsAt > Date.now()) {
      this.logger.warn(
        JSON.stringify({
          event: 'otp_locked_out',
          userId,
          lockoutEndsAt: new Date(lockoutEndsAt).toISOString(),
        }),
      );
      return {
        success: false,
        reason: 'locked_out',
        lockoutEndsAt: new Date(lockoutEndsAt),
      };
    }

    // Find valid OTP record
    const storeKey = `${userId}:${type}`;
    const otpRecord = this.otpStore.get(storeKey);

    if (!otpRecord || otpRecord.isUsed || otpRecord.expiresAt < Date.now()) {
      this.recordFailedAttempt(userId);
      return {
        success: false,
        reason: otpRecord?.isUsed ? 'already_used' : otpRecord ? 'expired' : 'invalid',
        attemptsRemaining: this.getAttemptsRemaining(userId),
      };
    }

    // Verify OTP
    const isValid = this.verifyOtpHash(code, otpRecord.salt, otpRecord.hash);

    if (!isValid) {
      const attemptsRemaining = this.recordFailedAttempt(userId);

      // Check if should lock out
      if (attemptsRemaining === 0) {
        this.lockoutStore.set(lockoutKey, Date.now() + this.lockoutDurationMs);
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

    // Mark OTP as used
    otpRecord.isUsed = true;

    // Clear failed attempts on success
    this.attemptStore.delete(`otp-attempts:${userId}`);

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
   * Check rate limit for an action
   */
  checkRateLimit(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      // First request or window expired
      this.rateLimitStore.set(key, {
        count: 1,
        resetAt: now + this.rateLimitWindowMs,
      });
      return {
        allowed: true,
        attemptsRemaining: this.rateLimitMax - 1,
        resetAt: new Date(now + this.rateLimitWindowMs),
      };
    }

    if (entry.count >= this.rateLimitMax) {
      return {
        allowed: false,
        attemptsRemaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    return {
      allowed: true,
      attemptsRemaining: this.rateLimitMax - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  /**
   * Record a failed OTP attempt
   */
  private recordFailedAttempt(userId: string): number {
    const key = `otp-attempts:${userId}`;
    const now = Date.now();
    const entry = this.attemptStore.get(key);

    if (!entry || now - entry.firstAttemptAt > this.lockoutDurationMs) {
      // First attempt or window expired
      this.attemptStore.set(key, { count: 1, firstAttemptAt: now });
      return this.maxAttempts - 1;
    }

    entry.count++;
    return Math.max(0, this.maxAttempts - entry.count);
  }

  /**
   * Get remaining attempts for a user
   */
  private getAttemptsRemaining(userId: string): number {
    const key = `otp-attempts:${userId}`;
    const entry = this.attemptStore.get(key);
    if (!entry) return this.maxAttempts;
    return Math.max(0, this.maxAttempts - entry.count);
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
   * Clean up expired entries (called periodically)
   */
  cleanupExpiredEntries() {
    const now = Date.now();

    // Clean up expired OTPs
    for (const [key, otp] of this.otpStore.entries()) {
      if (otp.expiresAt < now) {
        this.otpStore.delete(key);
      }
    }

    // Clean up expired rate limits
    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        this.rateLimitStore.delete(key);
      }
    }

    // Clean up expired lockouts
    for (const [key, endsAt] of this.lockoutStore.entries()) {
      if (endsAt < now) {
        this.lockoutStore.delete(key);
      }
    }

    // Clean up old attempt records
    for (const [key, entry] of this.attemptStore.entries()) {
      if (now - entry.firstAttemptAt > this.lockoutDurationMs) {
        this.attemptStore.delete(key);
      }
    }
  }
}
