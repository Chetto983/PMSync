/**
 * Prisma Retry Service
 *
 * Handles transient Prisma errors with exponential backoff:
 * - P2002: Unique constraint violation (race condition during upsert)
 * - P2034: Write conflict / deadlock in interactive transaction
 *
 * Per DRIVER_IMPLEMENTATION_SPEC.md Section 5.4
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface PrismaRetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 50
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds (cap for exponential backoff)
   * @default 2000
   */
  maxDelayMs?: number;

  /**
   * Add random jitter to prevent thundering herd
   * @default true
   */
  jitter?: boolean;

  /**
   * Custom logger name for context
   * @default 'PrismaRetry'
   */
  loggerName?: string;
}

/**
 * Prisma error codes that are retryable
 */
export const PRISMA_RETRYABLE_CODES = {
  /** Unique constraint violation - often from concurrent upserts */
  P2002: 'P2002',
  /** Write conflict / deadlock in interactive transaction */
  P2034: 'P2034',
} as const;

export type PrismaRetryableCode = keyof typeof PRISMA_RETRYABLE_CODES;

/**
 * Default configuration per DRIVER_IMPLEMENTATION_SPEC.md
 */
const DEFAULT_CONFIG: Required<Omit<PrismaRetryOptions, 'loggerName'>> = {
  maxAttempts: 3,
  initialDelayMs: 50,
  maxDelayMs: 2000,
  jitter: true,
};

@Injectable()
export class PrismaRetryService {
  private readonly logger = new Logger(PrismaRetryService.name);

  /**
   * Execute a Prisma operation with automatic retry on transient errors
   *
   * Handles:
   * - P2002: Unique constraint violation (race conditions in upsert)
   * - P2034: Deadlock / write conflict in interactive transactions
   *
   * @param fn - The async Prisma operation to execute
   * @param options - Retry configuration options
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted or error is not retryable
   *
   * @example
   * ```typescript
   * // Upsert with automatic P2002 retry
   * const result = await prismaRetry.withRetry(
   *   () => prisma.email.upsert({ ... }),
   *   { loggerName: 'EmailSync' }
   * );
   *
   * // Transaction with P2034 deadlock retry
   * const result = await prismaRetry.withRetry(
   *   () => prisma.$transaction([...]),
   *   { maxAttempts: 2, loggerName: 'BatchUpsert' }
   * );
   * ```
   */
  async withRetry<T>(fn: () => Promise<T>, options: PrismaRetryOptions = {}): Promise<T> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_CONFIG.maxAttempts;
    const initialDelayMs = options.initialDelayMs ?? DEFAULT_CONFIG.initialDelayMs;
    const maxDelayMs = options.maxDelayMs ?? DEFAULT_CONFIG.maxDelayMs;
    const jitter = options.jitter ?? DEFAULT_CONFIG.jitter;
    const loggerName = options.loggerName ?? 'PrismaRetry';

    let lastError: unknown;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if this is a retryable Prisma error
        const retryInfo = this.getRetryInfo(error);

        if (!retryInfo.isRetryable) {
          // Not a Prisma error or not retryable - throw immediately
          throw error;
        }

        if (attempt >= maxAttempts) {
          // Max retries exhausted
          const elapsedMs = Date.now() - startTime;
          const meta =
            error instanceof Prisma.PrismaClientKnownRequestError
              ? JSON.stringify(error.meta)
              : 'N/A';
          this.logger.error(
            `[${loggerName}] ${retryInfo.code} exhausted after ${maxAttempts} attempts (${elapsedMs}ms). ` +
              `Meta: ${meta}. Error: ${this.getErrorMessage(error)}`,
          );
          throw error;
        }

        // Calculate delay with exponential backoff
        let delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

        // Add jitter (±20%) to prevent thundering herd
        if (jitter) {
          const jitterFactor = 0.8 + Math.random() * 0.4;
          delay = Math.floor(delay * jitterFactor);
        }

        this.logger.warn(
          `[${loggerName}] ${retryInfo.code} error on attempt ${attempt}/${maxAttempts}. ` +
            `Retrying in ${delay}ms... Error: ${this.getErrorMessage(error)}`,
        );

        await this.sleep(delay);
      }
    }

    // Should not reach here, but TypeScript requires it
    throw lastError;
  }

  /**
   * Check if an error is a retryable Prisma error
   *
   * @param error - The error to check
   * @returns Object with isRetryable flag and error code if applicable
   */
  getRetryInfo(error: unknown): { isRetryable: boolean; code: string | null } {
    // Check for Prisma client known request error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const isRetryable = Object.values(PRISMA_RETRYABLE_CODES).includes(
        error.code as (typeof PRISMA_RETRYABLE_CODES)[PrismaRetryableCode],
      );
      return { isRetryable, code: error.code };
    }

    // Check for plain objects with code property (e.g., from raw queries)
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      const isRetryable = Object.values(PRISMA_RETRYABLE_CODES).includes(
        code as (typeof PRISMA_RETRYABLE_CODES)[PrismaRetryableCode],
      );
      return { isRetryable, code };
    }

    return { isRetryable: false, code: null };
  }

  /**
   * Check if an error is retryable (simplified boolean check)
   *
   * @param error - The error to check
   * @returns true if error is retryable Prisma error (P2002 or P2034)
   */
  isRetryable(error: unknown): boolean {
    return this.getRetryInfo(error).isRetryable;
  }

  /**
   * Check if error is a specific Prisma error code
   */
  isErrorCode(error: unknown, code: PrismaRetryableCode): boolean {
    const info = this.getRetryInfo(error);
    return info.code === PRISMA_RETRYABLE_CODES[code];
  }

  /**
   * Check if error is P2002 (unique constraint violation)
   */
  isUniqueConstraintError(error: unknown): boolean {
    return this.isErrorCode(error, 'P2002');
  }

  /**
   * Check if error is P2034 (deadlock / write conflict)
   */
  isDeadlockError(error: unknown): boolean {
    return this.isErrorCode(error, 'P2034');
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

/**
 * Standalone retry function for use outside of NestJS DI
 *
 * @param fn - The async Prisma operation to execute
 * @param options - Retry configuration options
 * @returns The result of the operation
 *
 * @example
 * ```typescript
 * import { withPrismaRetry } from '@common/services/prisma-retry.service';
 *
 * const result = await withPrismaRetry(
 *   () => prisma.email.upsert({ ... }),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  options: PrismaRetryOptions = {},
): Promise<T> {
  const service = new PrismaRetryService();
  return service.withRetry(fn, options);
}
