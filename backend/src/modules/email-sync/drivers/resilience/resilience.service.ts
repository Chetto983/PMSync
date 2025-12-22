import { Injectable, Logger } from '@nestjs/common';
import {
  ResilienceConfig,
  RetryConfig,
  RateLimitConfig,
  CircuitBreakerConfig,
  CircuitStatus,
  RateLimitStatus,
  OperationResult,
  DEFAULT_RESILIENCE_CONFIG,
  PROVIDER_RATE_LIMITS,
} from './resilience.types';

/**
 * Simple async mutex for per-account locking
 * RC-4/RC-5 Fix: Prevents race conditions in rate limiting and circuit breaker
 */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

/**
 * Resilience Service
 *
 * Provides retry, rate limiting, and circuit breaker functionality
 * for email drivers. Designed for >1000 concurrent users.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Per-account rate limiting
 * - Circuit breaker pattern
 * - Request timeouts
 * - Metrics tracking
 * - Thread-safe operations via per-account mutex (RC-4/RC-5 fix)
 */
@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);

  // Circuit breaker state per account
  private circuits = new Map<string, CircuitStatus>();

  // Rate limit buckets per account
  private rateLimitBuckets = new Map<string, RateLimitStatus>();

  // RC-4/RC-5 Fix: Per-account mutex for thread-safe operations
  private accountMutexes = new Map<string, AsyncMutex>();

  // Metrics for monitoring
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retriedRequests: 0,
    rateLimitedRequests: 0,
    circuitBreakerTrips: 0,
  };

  /**
   * Get or create mutex for an account
   */
  private getAccountMutex(accountId: string): AsyncMutex {
    let mutex = this.accountMutexes.get(accountId);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.accountMutexes.set(accountId, mutex);
    }
    return mutex;
  }

  /**
   * Execute an operation with full resilience (retry + rate limit + circuit breaker)
   * RC-4/RC-5 Fix: Uses per-account mutex for atomic rate limit and circuit breaker checks
   */
  async executeWithResilience<T>(
    accountId: string,
    providerType: 'google' | 'microsoft' | 'imap',
    operation: () => Promise<T>,
    config: Partial<ResilienceConfig> = {},
  ): Promise<OperationResult<T>> {
    const fullConfig = this.mergeConfig(providerType, config);
    const startTime = Date.now();
    let retries = 0;

    this.metrics.totalRequests++;

    // RC-4/RC-5 Fix: Acquire mutex for atomic check-and-record operations
    const mutex = this.getAccountMutex(accountId);
    await mutex.acquire();

    let circuitOpen = false;
    let rateLimited = false;
    let rateLimitRetryAfter: Date | undefined;
    let circuitRetryAfter: Date | undefined;

    try {
      // Check circuit breaker first (under mutex protection)
      const circuitStatus = this.getCircuitStatus(accountId);
      if (circuitStatus.state === 'open') {
        circuitOpen = true;
        circuitRetryAfter = circuitStatus.nextRetry;
      } else {
        // Check rate limit (under mutex protection)
        const rateLimitStatus = this.checkRateLimit(accountId, fullConfig.rateLimit);
        if (rateLimitStatus.isLimited) {
          rateLimited = true;
          rateLimitRetryAfter = rateLimitStatus.retryAfter;
        } else {
          // ML-2 fix: Record request ONCE before retries, not on each attempt
          // This is now atomic with the rate limit check (RC-4 fix)
          this.recordRequest(accountId);
        }
      }
    } finally {
      // Release mutex after atomic check-and-record
      mutex.release();
    }

    // Handle circuit open (outside mutex - no state modification needed)
    if (circuitOpen) {
      this.metrics.failedRequests++;
      return {
        success: false,
        error: new Error(`Circuit breaker open for account ${accountId}. Retry after ${circuitRetryAfter?.toISOString()}`),
        retries: 0,
        duration: Date.now() - startTime,
        rateLimited: false,
        circuitOpen: true,
      };
    }

    // Handle rate limited (outside mutex - no state modification needed)
    if (rateLimited) {
      this.metrics.rateLimitedRequests++;
      return {
        success: false,
        error: new Error(`Rate limited for account ${accountId}. Retry after ${rateLimitRetryAfter?.toISOString()}`),
        retries: 0,
        duration: Date.now() - startTime,
        rateLimited: true,
        circuitOpen: false,
      };
    }

    // Execute with retry
    let lastError: Error | undefined;

    while (retries <= fullConfig.retry.maxRetries) {
      try {
        // Execute with timeout
        const data = await this.withTimeout(
          operation(),
          fullConfig.timeout.requestTimeoutMs,
        );

        // Success - record with mutex protection (RC-5 fix)
        await mutex.acquire();
        try {
          this.recordSuccess(accountId, fullConfig.circuitBreaker);
        } finally {
          mutex.release();
        }
        this.metrics.successfulRequests++;

        return {
          success: true,
          data,
          retries,
          duration: Date.now() - startTime,
          rateLimited: false,
          circuitOpen: false,
        };
      } catch (error: any) {
        lastError = error;
        retries++;

        // Check if error is retryable
        if (!this.isRetryable(error, fullConfig.retry)) {
          this.logger.warn(
            `Non-retryable error for account ${accountId}: ${error.message}`,
          );
          break;
        }

        // Check if we should retry
        if (retries > fullConfig.retry.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(retries, fullConfig.retry);
        this.logger.debug(
          `Retry ${retries}/${fullConfig.retry.maxRetries} for account ${accountId} in ${delay}ms`,
        );
        this.metrics.retriedRequests++;

        await this.sleep(delay);

        // Re-check rate limit before retry (with mutex for RC-4 fix)
        await mutex.acquire();
        let retryRateLimitStatus: RateLimitStatus;
        try {
          retryRateLimitStatus = this.checkRateLimit(accountId, fullConfig.rateLimit);
        } finally {
          mutex.release();
        }
        if (retryRateLimitStatus.isLimited && retryRateLimitStatus.retryAfter) {
          // Guard against negative sleep if retryAfter is in the past
          const waitMs = retryRateLimitStatus.retryAfter.getTime() - Date.now();
          if (waitMs > 0) {
            await this.sleep(waitMs);
          }
        }
      }
    }

    // All retries exhausted - record failure with mutex protection (RC-5 fix)
    await mutex.acquire();
    try {
      this.recordFailure(accountId, fullConfig.circuitBreaker);
    } finally {
      mutex.release();
    }
    this.metrics.failedRequests++;

    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      retries,
      duration: Date.now() - startTime,
      rateLimited: false,
      circuitOpen: false,
    };
  }

  /**
   * Execute with retry only (no rate limit or circuit breaker)
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RESILIENCE_CONFIG.retry, ...config };
    let retries = 0;
    let lastError: Error | undefined;

    while (retries <= retryConfig.maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        retries++;

        if (!this.isRetryable(error, retryConfig) || retries > retryConfig.maxRetries) {
          throw error;
        }

        const delay = this.calculateDelay(retries, retryConfig);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Wrap a promise with a timeout
   */
  async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  // ============================================
  // Circuit Breaker
  // ============================================

  private getCircuitStatus(accountId: string): CircuitStatus {
    let status = this.circuits.get(accountId);

    if (!status) {
      status = {
        state: 'closed',
        failures: 0,
        successCount: 0,
      };
      this.circuits.set(accountId, status);
    }

    // Check if we should transition from open to half-open
    if (status.state === 'open' && status.nextRetry && new Date() >= status.nextRetry) {
      status.state = 'half-open';
      status.successCount = 0;
      this.logger.log(`Circuit breaker half-open for account ${accountId}`);
    }

    return status;
  }

  private recordSuccess(accountId: string, config: CircuitBreakerConfig): void {
    const status = this.circuits.get(accountId);
    if (!status) return;

    if (status.state === 'half-open') {
      status.successCount++;
      // Use passed config instead of hardcoded DEFAULT
      if (status.successCount >= config.successThreshold) {
        status.state = 'closed';
        status.failures = 0;
        status.successCount = 0;
        this.logger.log(`Circuit breaker closed for account ${accountId}`);
      }
    } else if (status.state === 'closed') {
      // Reset failure count on success
      status.failures = Math.max(0, status.failures - 1);
    }
  }

  private recordFailure(accountId: string, config: CircuitBreakerConfig): void {
    let status = this.circuits.get(accountId);

    if (!status) {
      status = {
        state: 'closed',
        failures: 0,
        successCount: 0,
      };
      this.circuits.set(accountId, status);
    }

    status.failures++;
    status.lastFailure = new Date();

    if (status.failures >= config.failureThreshold) {
      status.state = 'open';
      status.nextRetry = new Date(Date.now() + config.resetTimeoutMs);
      this.metrics.circuitBreakerTrips++;
      this.logger.warn(
        `Circuit breaker opened for account ${accountId}. Next retry: ${status.nextRetry.toISOString()}`,
      );
    }
  }

  /**
   * Manually reset circuit breaker for an account
   */
  resetCircuitBreaker(accountId: string): void {
    this.circuits.delete(accountId);
    this.logger.log(`Circuit breaker reset for account ${accountId}`);
  }

  // ============================================
  // Rate Limiting
  // ============================================

  private checkRateLimit(accountId: string, config: RateLimitConfig): RateLimitStatus {
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(accountId);

    if (!bucket) {
      bucket = {
        accountId,
        requestsThisSecond: 0,
        requestsThisMinute: 0,
        lastRequestAt: new Date(0),
        isLimited: false,
      };
      this.rateLimitBuckets.set(accountId, bucket);
    }

    // Reset counters if time windows have passed
    const lastRequestTime = bucket.lastRequestAt.getTime();
    if (now - lastRequestTime >= 1000) {
      bucket.requestsThisSecond = 0;
    }
    if (now - lastRequestTime >= 60000) {
      bucket.requestsThisMinute = 0;
    }

    // Check limits
    if (bucket.requestsThisSecond >= config.requestsPerSecond) {
      bucket.isLimited = true;
      bucket.retryAfter = new Date(lastRequestTime + 1000);
      return bucket;
    }

    if (bucket.requestsThisMinute >= config.requestsPerMinute) {
      bucket.isLimited = true;
      bucket.retryAfter = new Date(lastRequestTime + config.cooldownMs);
      return bucket;
    }

    bucket.isLimited = false;
    bucket.retryAfter = undefined;
    return bucket;
  }

  private recordRequest(accountId: string): void {
    let bucket = this.rateLimitBuckets.get(accountId);

    if (!bucket) {
      bucket = {
        accountId,
        requestsThisSecond: 0,
        requestsThisMinute: 0,
        lastRequestAt: new Date(),
        isLimited: false,
      };
      this.rateLimitBuckets.set(accountId, bucket);
    }

    bucket.requestsThisSecond++;
    bucket.requestsThisMinute++;
    bucket.lastRequestAt = new Date();
  }

  /**
   * Manually reset rate limit for an account
   */
  resetRateLimit(accountId: string): void {
    this.rateLimitBuckets.delete(accountId);
    this.logger.log(`Rate limit reset for account ${accountId}`);
  }

  // ============================================
  // Retry Logic
  // ============================================

  private isRetryable(error: any, config: RetryConfig): boolean {
    // Check HTTP status codes
    const status = error.response?.status || error.status || error.code;
    if (typeof status === 'number' && config.retryableErrors.includes(status)) {
      return true;
    }

    // Check exception types
    const errorCode = error.code || error.errno;
    if (errorCode && config.retryableExceptions.includes(errorCode)) {
      return true;
    }

    // Check error message patterns
    const message = error.message?.toLowerCase() || '';
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('temporarily unavailable') ||
      message.includes('service unavailable') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff: baseDelay * (exponentialBase ^ attempt)
    const exponentialDelay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * config.jitterFactor * Math.random();

    return Math.floor(cappedDelay + jitter);
  }

  // ============================================
  // Utilities
  // ============================================

  private mergeConfig(
    providerType: 'google' | 'microsoft' | 'imap',
    partial: Partial<ResilienceConfig>,
  ): ResilienceConfig {
    const providerRateLimit = PROVIDER_RATE_LIMITS[providerType] || PROVIDER_RATE_LIMITS.google;

    return {
      retry: { ...DEFAULT_RESILIENCE_CONFIG.retry, ...partial.retry },
      rateLimit: { ...providerRateLimit, ...partial.rateLimit },
      circuitBreaker: { ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker, ...partial.circuitBreaker },
      timeout: { ...DEFAULT_RESILIENCE_CONFIG.timeout, ...partial.timeout },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // Metrics & Monitoring
  // ============================================

  /**
   * Get current metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get circuit breaker status for all accounts
   */
  getAllCircuitStatus(): Map<string, CircuitStatus> {
    return new Map(this.circuits);
  }

  /**
   * Get rate limit status for all accounts
   */
  getAllRateLimitStatus(): Map<string, RateLimitStatus> {
    return new Map(this.rateLimitBuckets);
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      rateLimitedRequests: 0,
      circuitBreakerTrips: 0,
    };
  }

  /**
   * Cleanup stale entries (call periodically)
   * Phase 6: Made stale threshold configurable via RESILIENCE_STALE_THRESHOLD_HOURS env var
   */
  cleanup(): void {
    const now = Date.now();
    const staleHours = parseInt(process.env.RESILIENCE_STALE_THRESHOLD_HOURS || '24', 10);
    const staleThreshold = staleHours * 60 * 60 * 1000; // Default: 24 hours

    // Clean up old circuit breaker entries
    for (const [accountId, status] of this.circuits) {
      if (status.lastFailure && now - status.lastFailure.getTime() > staleThreshold) {
        this.circuits.delete(accountId);
      }
    }

    // Clean up old rate limit buckets
    for (const [accountId, bucket] of this.rateLimitBuckets) {
      if (now - bucket.lastRequestAt.getTime() > staleThreshold) {
        this.rateLimitBuckets.delete(accountId);
      }
    }

    // Clean up stale mutexes (for accounts with no active rate limit or circuit breaker)
    for (const accountId of this.accountMutexes.keys()) {
      if (!this.circuits.has(accountId) && !this.rateLimitBuckets.has(accountId)) {
        this.accountMutexes.delete(accountId);
      }
    }
  }
}
