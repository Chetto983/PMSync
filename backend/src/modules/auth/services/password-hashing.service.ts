import { Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { compare } from 'bcrypt';
import { AuthConfigService } from './auth-config.service';

/**
 * Dual-algorithm password hashing service.
 *
 * Hashes new passwords with Argon2id (2026 best practice, OWASP recommended).
 * Verifies existing passwords against both Argon2id and bcrypt hashes,
 * flagging bcrypt hashes for transparent rehashing on next login.
 *
 * @see NIST SP 800-63B-4 (July 2025)
 * @see OWASP Password Storage Cheat Sheet (2025)
 */
@Injectable()
export class PasswordHashingService {
  private readonly logger = new Logger(PasswordHashingService.name);

  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;

  constructor(private readonly authConfig: AuthConfigService) {
    this.memoryCost = authConfig.argon2MemoryCost;
    this.timeCost = authConfig.argon2TimeCost;
    this.parallelism = authConfig.argon2Parallelism;
  }

  /**
   * Hash a password using Argon2id with configured parameters.
   *
   * @param password - Plaintext password to hash
   * @returns Argon2id hash string (starts with $argon2id$)
   */
  async hashPassword(password: string): Promise<string> {
    return hash(password, {
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  /**
   * Verify a password against a stored hash.
   *
   * Detects algorithm by hash prefix:
   * - $argon2id$ -> Argon2id verification
   * - $2b$ or $2a$ -> bcrypt verification (flags needsRehash=true on success)
   * - Other -> returns invalid
   *
   * @param password - Plaintext password to verify
   * @param storedHash - Stored hash string
   * @returns { valid, needsRehash } where needsRehash=true only for successful bcrypt verify
   */
  async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<{ valid: boolean; needsRehash: boolean }> {
    try {
      if (storedHash.startsWith('$argon2id$')) {
        const valid = await verify(storedHash, password);
        return { valid, needsRehash: false };
      }

      if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
        const valid = await compare(password, storedHash);
        if (valid) {
          this.logger.log(
            JSON.stringify({
              event: 'password_rehash_needed',
              algorithm: 'bcrypt',
              reason: 'migrating to argon2id',
            }),
          );
          return { valid: true, needsRehash: true };
        }
        return { valid: false, needsRehash: false };
      }

      // Unrecognized hash format
      this.logger.warn(
        JSON.stringify({
          event: 'password_verify_unknown_format',
          prefix: storedHash.substring(0, 10),
        }),
      );
      return { valid: false, needsRehash: false };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'password_verify_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return { valid: false, needsRehash: false };
    }
  }

  /**
   * Run a real Argon2id hash on a dummy string.
   *
   * Used for timing protection: when a user is not found during login,
   * call this to consume the same CPU time as a real verification,
   * preventing user-enumeration via timing side-channel.
   */
  async dummyHash(): Promise<void> {
    await hash('dummy-timing-protection-string', {
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }
}
