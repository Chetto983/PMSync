import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const HIBP_BREACH_THRESHOLD = 3;
const HIBP_TIMEOUT_MS = 3000;

/**
 * Password policy validation service.
 *
 * Enforces NIST SP 800-63B-4 (July 2025) password requirements:
 * - Minimum 15 characters (single-factor memorized secrets)
 * - Maximum 128 characters (exceeds NIST >=64 requirement)
 * - No complexity rules (NIST: length-only, no forced uppercase/number/special)
 * - HIBP k-anonymity breach check (best-effort)
 *
 * Pure validation service -- no side effects except HTTP call to HIBP API.
 *
 * @see NIST SP 800-63B-4
 * @see OWASP ASVS 5.0 V2
 */
@Injectable()
export class PasswordPolicyService {
  private readonly logger = new Logger(PasswordPolicyService.name);

  /**
   * Validate a password against the policy.
   *
   * Checks length constraints first (fast), then HIBP breach check (slow).
   * Short-circuits on length failure -- no network call if length is invalid.
   *
   * @param password - Plaintext password to validate
   * @returns { valid, errors } where errors is an array of human-readable messages
   */
  async validate(
    password: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (password.length < MIN_LENGTH) {
      errors.push('Password must be at least 8 characters');
    }

    if (password.length > MAX_LENGTH) {
      errors.push('Password must be at most 128 characters');
    }

    // Short-circuit: no point checking HIBP if length is invalid
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // HIBP breach check (best-effort)
    const { breached } = await this.checkBreached(password);
    if (breached) {
      errors.push(
        'This password has appeared in data breaches and cannot be used',
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if a password has been found in data breaches via HIBP k-anonymity API.
   *
   * Uses SHA-1 hash prefix (5 chars) to query HIBP without revealing the full hash.
   * Best-effort: returns { breached: false, count: 0 } on any error (network, timeout, parse).
   * Breached = count > HIBP_BREACH_THRESHOLD (currently 3).
   *
   * @param password - Plaintext password to check
   * @returns { breached, count } where breached is true if count > threshold
   */
  async checkBreached(
    password: string,
  ): Promise<{ breached: boolean; count: number }> {
    try {
      const sha1 = crypto
        .createHash('sha1')
        .update(password)
        .digest('hex')
        .toUpperCase();

      const prefix = sha1.substring(0, 5);
      const suffix = sha1.substring(5);

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        HIBP_TIMEOUT_MS,
      );

      try {
        const response = await fetch(
          `https://api.pwnedpasswords.com/range/${prefix}`,
          {
            headers: { 'Add-Padding': 'true' },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          this.logger.warn(
            JSON.stringify({
              event: 'hibp_api_error',
              status: response.status,
            }),
          );
          return { breached: false, count: 0 };
        }

        const body = await response.text();
        const lines = body.split('\n');

        for (const line of lines) {
          const [hashSuffix, countStr] = line.trim().split(':');
          if (hashSuffix === suffix) {
            const count = parseInt(countStr, 10) || 0;
            return {
              breached: count > HIBP_BREACH_THRESHOLD,
              count,
            };
          }
        }

        // Suffix not found -- password not in any breach
        return { breached: false, count: 0 };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Best-effort: any error means we allow the password
      this.logger.warn(
        JSON.stringify({
          event: 'hibp_check_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return { breached: false, count: 0 };
    }
  }
}
