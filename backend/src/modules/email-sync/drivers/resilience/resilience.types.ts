/**
 * Resilience Layer Types
 *
 * Shared types for retry, rate limiting, circuit breaker, and timeout handling.
 * Designed for >1000 concurrent users with different email providers.
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number;           // Max retry attempts (default: 3)
  baseDelayMs: number;          // Base delay between retries (default: 1000)
  maxDelayMs: number;           // Maximum delay cap (default: 30000)
  exponentialBase: number;      // Exponential multiplier (default: 2)
  jitterFactor: number;         // Random jitter 0-1 (default: 0.1)
  retryableErrors: number[];    // HTTP status codes to retry (default: [429, 500, 502, 503, 504])
  retryableExceptions: string[];// Exception types to retry (default: ['ECONNRESET', 'ETIMEDOUT'])
}

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
  requestsPerSecond: number;    // Max requests per second per account
  requestsPerMinute: number;    // Max requests per minute per account
  /** @deprecated Not implemented - will be removed in future version */
  burstLimit?: number;          // Max burst requests allowed (NOT IMPLEMENTED)
  cooldownMs: number;           // Cooldown after hitting limit (default: 60000)
}

/**
 * Configuration for circuit breaker
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures before opening circuit (default: 5)
  resetTimeoutMs: number;       // Time before trying again (default: 60000)
  /** @deprecated Not implemented - will be removed in future version */
  halfOpenRequests?: number;    // Requests to try in half-open state (NOT IMPLEMENTED)
  successThreshold: number;     // Successes to close circuit (default: 2)
}

/**
 * Configuration for timeouts
 */
export interface TimeoutConfig {
  connectTimeoutMs: number;     // Connection timeout (default: 10000)
  requestTimeoutMs: number;     // Per-request timeout (default: 30000)
  batchTimeoutMs: number;       // Batch operation timeout (default: 120000)
  idleTimeoutMs: number;        // Idle connection timeout (default: 60000)
}

/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
  retry: RetryConfig;
  rateLimit: RateLimitConfig;
  circuitBreaker: CircuitBreakerConfig;
  timeout: TimeoutConfig;
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker status
 */
export interface CircuitStatus {
  state: CircuitState;
  failures: number;
  lastFailure?: Date;
  nextRetry?: Date;
  successCount: number;
}

/**
 * Rate limit bucket status
 */
export interface RateLimitStatus {
  accountId: string;
  requestsThisSecond: number;
  requestsThisMinute: number;
  lastRequestAt: Date;
  isLimited: boolean;
  retryAfter?: Date;
}

/**
 * Operation result with metadata
 */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  retries: number;
  duration: number;
  rateLimited: boolean;
  circuitOpen: boolean;
}

/**
 * Provider-specific rate limits based on API documentation
 */
export const PROVIDER_RATE_LIMITS: Record<string, RateLimitConfig> = {
  google: {
    requestsPerSecond: 10,      // Gmail API: ~10 QPS per user
    requestsPerMinute: 250,     // Conservative estimate
    burstLimit: 25,             // Short burst allowed
    cooldownMs: 60000,
  },
  microsoft: {
    requestsPerSecond: 8,       // Graph API: ~8 QPS per user conservative estimate
    requestsPerMinute: 180,     // Graph API allows higher but this is safe for production
    burstLimit: 30,             // @deprecated - not implemented
    cooldownMs: 30000,          // 30s cooldown on rate limit
  },
  imap: {
    requestsPerSecond: 5,       // IMAP is connection-based, not request-based
    requestsPerMinute: 200,     // Most IMAP servers allow more
    burstLimit: 10,
    cooldownMs: 30000,
  },
};

/**
 * Default resilience configuration
 */
export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBase: 2,
    jitterFactor: 0.1,
    retryableErrors: [429, 500, 502, 503, 504],
    retryableExceptions: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'],
  },
  rateLimit: PROVIDER_RATE_LIMITS.google, // Default to Google limits
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenRequests: 1,
    successThreshold: 2,
  },
  timeout: {
    connectTimeoutMs: 10000,
    requestTimeoutMs: 30000,
    batchTimeoutMs: 120000,
    idleTimeoutMs: 60000,
  },
};
