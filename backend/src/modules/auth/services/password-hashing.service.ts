import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

/**
 * Password hashing service using bcrypt.
 *
 * Temporary: will be replaced by better-auth in v5.0.
 * Supports verifying old Argon2id hashes for backward compatibility.
 */
@Injectable()
export class PasswordHashingService {
  private readonly logger = new Logger(PasswordHashingService.name);

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<{ valid: boolean; needsRehash: boolean }> {
    try {
      if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
        const valid = await bcrypt.compare(password, storedHash);
        return { valid, needsRehash: false };
      }

      if (storedHash.startsWith('$argon2id$')) {
        // Lazy-load argon2 only for legacy hash verification
        try {
          const { verify } = await import('@node-rs/argon2');
          const valid = await verify(storedHash, password);
          return { valid, needsRehash: true };
        } catch {
          this.logger.warn('Argon2 verification failed — user must reset password');
          return { valid: false, needsRehash: false };
        }
      }

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

  async dummyHash(): Promise<void> {
    await bcrypt.hash('dummy-timing-protection', BCRYPT_ROUNDS);
  }
}
