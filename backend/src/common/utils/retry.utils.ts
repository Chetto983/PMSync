/**
 * Retry Utilities with Exponential Backoff
 *
 * Industrial-grade retry mechanism for API calls with:
 * - Exponential backoff with jitter
 * - Circuit breaker integration
 * - Rate limit handling (429, Retry-After)
 * - Auth error detection (401)
 * - Server error retry (5xx)
 *
 * CONSOLIDATED from calendar/utils/retry.ts (2025-01-05)
 * Used by: email-sync drivers, calendar, contacts, ai modules
 */

import { Logger } from '@nestjs/common';
import { CircuitBreaker, getCircuitBreaker } from './circuit-breaker.utils';
import { getErrorMessage } from './error.utils';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Logger for retry attempts */
  logger?: Logger;
  /** Operation name for logging */
  operationName?: string;
  /** Provider for circuit breaker */
  provider?: 'google' | 'microsoft' | 'imap' | 'mistral';
  /** Use circuit breaker (default: true) */
  useCircuitBreaker?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'logger' | 'operationName' | 'provider'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: isRetryableError,
  useCircuitBreaker: true,
};

/**
 * Execute a function with retry logic
 *
 * @example
 * // Simple usage
 * const result = await withRetry(
 *   () => apiClient.get('/endpoint'),
 *   { operationName: 'fetchData', provider: 'google' }
 * );
 *
 * @example
 * // With custom retry logic
 * const result = await withRetry(
 *   () => fetchEmails(),
 *   {
 *     maxRetries: 5,
 *     isRetryable: (err) => err.status === 429 || err.status >= 500,
 *     provider: 'microsoft'
 *   }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const logger = opts.logger ?? new Logger('RetryUtils');
  const opName = opts.operationName ?? 'operation';

  // Get circuit breaker if enabled
  let circuitBreaker: CircuitBreaker | null = null;
  if (opts.useCircuitBreaker && opts.provider) {
    circuitBreaker = getCircuitBreaker(opts.provider, opName);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Execute through circuit breaker if available
      if (circuitBreaker) {
        return await circuitBreaker.execute(fn);
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Mark 401 errors for token refresh
      if (getHttpStatus(error) === 401) {
        (error as any).requiresTokenRefresh = true;
      }

      // Check if we should retry
      const isRetryableErr = opts.isRetryable?.(error) ?? false;
      const hasRetriesLeft = attempt < opts.maxRetries;

      if (!isRetryableErr || !hasRetriesLeft) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
      delay = Math.min(delay, opts.maxDelayMs);

      // Add jitter (±20%)
      if (opts.jitter) {
        const jitterFactor = 0.8 + Math.random() * 0.4;
        delay = Math.floor(delay * jitterFactor);
      }

      // Check if error specifies retry-after
      const retryAfter = getRetryAfter(error);
      if (retryAfter && retryAfter > delay) {
        delay = Math.min(retryAfter, opts.maxDelayMs);
      }

      logger.warn(
        `${opName} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms: ${getErrorMessage(error)}`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: RetryOptions,
): T {
  return ((...args: Parameters<T>) => {
    return withRetry(() => fn(...args), options);
  }) as T;
}

/**
 * Decorator for retryable methods
 *
 * @example
 * class MyService {
 *   @Retryable({ provider: 'google', operationName: 'listEmails' })
 *   async listEmails() { ... }
 * }
 */
export function Retryable(options?: RetryOptions): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        {
          ...options,
          operationName: options?.operationName ?? String(propertyKey),
        },
      );
    };

    return descriptor;
  };
}

/**
 * Check if an error is retryable
 * Handles: 429, 5xx, network errors, timeouts
 */
export function isRetryableError(error: unknown): boolean {
  const status = getHttpStatus(error);

  // 429 Too Many Requests - always retry
  if (status === 429) return true;

  // 5xx Server Errors - retry
  if (status && status >= 500 && status < 600) return true;

  // 408 Request Timeout - retry
  if (status === 408) return true;

  // Check for structured retryable property
  if (error && typeof error === 'object' && 'retryable' in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }

  // Check for network errors or timeouts
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('network error') ||
    message.includes('etimedout')
  );
}

/**
 * Check if error requires token refresh (401)
 */
export function requiresTokenRefresh(error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status === 401) return true;
  return Boolean((error as any)?.requiresTokenRefresh);
}

/**
 * Extract HTTP status code from various error types
 */
export function getHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  // Google API error format
  if ('code' in error && typeof (error as any).code === 'number') {
    return (error as any).code;
  }

  // Axios error format
  if ('response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status) return response.status;
  }

  // Generic status property
  if ('status' in error && typeof (error as any).status === 'number') {
    return (error as any).status;
  }

  // httpStatus property (CalendarError format)
  if ('httpStatus' in error && typeof (error as any).httpStatus === 'number') {
    return (error as any).httpStatus;
  }

  return null;
}

/**
 * Extract retry-after value from error (in milliseconds)
 */
export function getRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;

  // Check for retryAfterMs property
  if ('retryAfterMs' in error) {
    const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
    if (typeof retryAfterMs === 'number') {
      return retryAfterMs;
    }
  }

  // Check for axios error with Retry-After header
  const axiosError = error as {
    response?: { headers?: Record<string, string> };
  };
  const retryAfterHeader = axiosError.response?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  return null;
}

// getErrorMessage is imported from error.utils.ts to avoid duplication

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly requests: number[] = [];
  private readonly logger = new Logger('RateLimiter');

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed, wait if rate limited
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old requests
    while (this.requests.length > 0 && this.requests[0] < windowStart) {
      this.requests.shift();
    }

    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.windowMs - now;

      this.logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);

      // Retry after waiting
      return this.acquire();
    }

    this.requests.push(now);
  }

  /**
   * Get current request count in window
   */
  getCurrentCount(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    return this.requests.filter((t) => t >= windowStart).length;
  }
}

/**
 * Provider-specific rate limiters
 */
export const googleApiRateLimiter = new RateLimiter(
  100, // 100 requests
  100000, // per 100 seconds (Google's quota)
);

export const microsoftGraphRateLimiter = new RateLimiter(
  60, // 60 requests
  60000, // per minute (conservative for Microsoft)
);

export const mistralApiRateLimiter = new RateLimiter(
  30, // 30 requests
  60000, // per minute (conservative for Mistral)
);
