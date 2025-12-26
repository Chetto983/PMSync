import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
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
import { getRedisConnectionOptions } from '../../../../config/configuration';

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
/**
 * CRIT-4 FIX: Redis-backed resilience service for horizontal scaling
 *
 * Previous implementation used in-memory Maps which don't work across
 * multiple instances. Now uses Redis for:
 * - Circuit breaker state (HASH)
 * - Rate limit buckets (HASH with TTL)
 * - Distributed locking (SETNX)
 *
 * This ensures consistent circuit breaker and rate limiting behavior
 * across all running instances.
 *
 * RC-16/RC-17 FIX: Uses Lua scripts for atomic circuit breaker transitions
 * RC-19 FIX: Uses Lua scripts for atomic rate limit check + increment
 * NEW-1 FIX: Health check interval for degraded mode recovery
 */
@Injectable()
export class ResilienceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResilienceService.name);
  private redis!: Redis;

  // Redis key prefixes for distributed state
  private readonly CIRCUIT_KEY_PREFIX = 'resilience:circuit:';
  private readonly RATE_LIMIT_KEY_PREFIX = 'resilience:ratelimit:';

  // Local fallback caches (used when Redis fails - fail open pattern)
  private circuits = new Map<string, CircuitStatus>();
  private rateLimitBuckets = new Map<string, RateLimitStatus>();

  // RC-4/RC-5 Fix: Per-account mutex for thread-safe operations (local fallback)
  private accountMutexes = new Map<string, AsyncMutex>();

  // Track if we're in degraded mode (Redis unavailable)
  private degradedMode = false;

  // NEW-1 FIX: Health check interval for degraded mode recovery
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  // Metrics for monitoring
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retriedRequests: 0,
    rateLimitedRequests: 0,
    circuitBreakerTrips: 0,
  };

  // RC-16/RC-17 FIX: Lua script for atomic circuit breaker operations
  private readonly CIRCUIT_LUA_SCRIPT = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local action = ARGV[2]
    local successThreshold = tonumber(ARGV[3]) or 3
    local failureThreshold = tonumber(ARGV[4]) or 5
    local resetTimeoutMs = tonumber(ARGV[5]) or 60000

    -- Get current state
    local state = redis.call('HGET', key, 'state') or 'closed'
    local failures = tonumber(redis.call('HGET', key, 'failures')) or 0
    local successCount = tonumber(redis.call('HGET', key, 'successCount')) or 0
    local nextRetry = tonumber(redis.call('HGET', key, 'nextRetry')) or 0

    if action == 'check' then
      -- Check if circuit should transition from open to half-open
      if state == 'open' and now >= nextRetry then
        redis.call('HMSET', key, 'state', 'half-open', 'successCount', '0')
        redis.call('EXPIRE', key, 86400)
        return {'half-open', '0', tostring(successCount), tostring(nextRetry)}
      end
      return {state, tostring(failures), tostring(successCount), tostring(nextRetry)}

    elseif action == 'success' then
      if state == 'half-open' then
        -- Atomic increment and check threshold
        local newCount = redis.call('HINCRBY', key, 'successCount', 1)
        if newCount >= successThreshold then
          redis.call('HMSET', key, 'state', 'closed', 'failures', '0', 'successCount', '0')
          redis.call('EXPIRE', key, 86400)
          return {'closed', '0', '0', '0'}
        end
        redis.call('EXPIRE', key, 86400)
        return {'half-open', '0', tostring(newCount), '0'}
      elseif state == 'closed' then
        -- Decrement failure count on success
        local newFailures = math.max(0, failures - 1)
        redis.call('HSET', key, 'failures', tostring(newFailures))
        redis.call('EXPIRE', key, 86400)
        return {'closed', tostring(newFailures), '0', '0'}
      end
      return {state, tostring(failures), tostring(successCount), tostring(nextRetry)}

    elseif action == 'failure' then
      -- Atomic increment failures and check threshold
      local newFailures = redis.call('HINCRBY', key, 'failures', 1)
      local newNextRetry = now + resetTimeoutMs
      redis.call('HSET', key, 'lastFailure', tostring(now))

      if newFailures >= failureThreshold then
        redis.call('HMSET', key, 'state', 'open', 'nextRetry', tostring(newNextRetry))
        redis.call('EXPIRE', key, 86400)
        return {'open', tostring(newFailures), '0', tostring(newNextRetry)}
      end
      redis.call('EXPIRE', key, 86400)
      return {state, tostring(newFailures), tostring(successCount), tostring(nextRetry)}
    end

    return {state, tostring(failures), tostring(successCount), tostring(nextRetry)}
  `;

  // RC-19 FIX: Lua script for atomic rate limit check + increment
  private readonly RATE_LIMIT_LUA_SCRIPT = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local limitPerSecond = tonumber(ARGV[2])
    local limitPerMinute = tonumber(ARGV[3])
    local cooldownMs = tonumber(ARGV[4])

    local lastReq = tonumber(redis.call('HGET', key, 'lastRequestAt')) or 0
    local reqSec = tonumber(redis.call('HGET', key, 'requestsThisSecond')) or 0
    local reqMin = tonumber(redis.call('HGET', key, 'requestsThisMinute')) or 0

    -- Reset counters if time windows have passed
    if now - lastReq >= 1000 then
      reqSec = 0
    end
    if now - lastReq >= 60000 then
      reqMin = 0
    end

    -- Check limits BEFORE increment (atomic check)
    if reqSec >= limitPerSecond then
      return {'0', tostring(reqSec), tostring(reqMin), tostring(lastReq + 1000)}
    end
    if reqMin >= limitPerMinute then
      return {'0', tostring(reqSec), tostring(reqMin), tostring(lastReq + cooldownMs)}
    end

    -- Atomic increment (allowed)
    redis.call('HMSET', key,
      'requestsThisSecond', tostring(reqSec + 1),
      'requestsThisMinute', tostring(reqMin + 1),
      'lastRequestAt', tostring(now))
    redis.call('EXPIRE', key, 120)

    return {'1', tostring(reqSec + 1), tostring(reqMin + 1), '0'}
  `;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const options = getRedisConnectionOptions();
    this.redis = new Redis({
      ...options,
      connectionName: 'resilience-service',
      lazyConnect: false,
      // Enable auto-reconnect
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on('error', (err) => {
      this.logger.error(`CRIT-4: Redis resilience service error: ${err.message}`);
      this.degradedMode = true;
    });

    this.redis.on('connect', () => {
      this.logger.log('CRIT-4: Redis resilience service connected');
      this.degradedMode = false;
    });

    this.redis.on('ready', () => {
      this.degradedMode = false;
    });

    // NEW-1 FIX: Start periodic health check for degraded mode recovery
    this.healthCheckInterval = setInterval(() => {
      this.checkRedisHealth().catch(() => {
        // Ignore errors in health check
      });
    }, this.HEALTH_CHECK_INTERVAL_MS);
    // Prevent interval from keeping Node.js process alive
    this.healthCheckInterval.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    // NEW-1 FIX: Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    if (this.redis) {
      await this.redis.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }

  /**
   * NEW-1 FIX: Check Redis health and recover from degraded mode
   */
  private async checkRedisHealth(): Promise<void> {
    if (!this.degradedMode) return;

    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') {
        this.logger.log('CRIT-4: Redis recovered, exiting degraded mode');
        this.degradedMode = false;
      }
    } catch {
      // Still degraded, will check again next interval
    }
  }

  /**
   * RC-16/RC-17 FIX: Execute circuit breaker Lua script atomically
   */
  private async executeCircuitLuaScript(
    accountId: string,
    action: 'check' | 'success' | 'failure',
    config: CircuitBreakerConfig,
  ): Promise<CircuitStatus> {
    const key = `${this.CIRCUIT_KEY_PREFIX}${accountId}`;
    const now = Date.now();

    try {
      const result = await this.redis.eval(
        this.CIRCUIT_LUA_SCRIPT,
        1,
        key,
        now.toString(),
        action,
        config.successThreshold.toString(),
        config.failureThreshold.toString(),
        config.resetTimeoutMs.toString(),
      ) as string[];

      const [state, failures, successCount, nextRetry] = result;

      // Log circuit breaker trips
      if (action === 'failure' && state === 'open') {
        this.metrics.circuitBreakerTrips++;
        this.logger.warn(
          `Circuit breaker opened for account ${accountId}. Next retry: ${new Date(parseInt(nextRetry, 10)).toISOString()}`,
        );
      }

      // Log circuit breaker recovery
      if (action === 'success' && state === 'closed' && this.circuits.get(accountId)?.state === 'half-open') {
        this.logger.log(`Circuit breaker closed for account ${accountId}`);
      }

      return {
        state: state as 'closed' | 'open' | 'half-open',
        failures: parseInt(failures, 10),
        successCount: parseInt(successCount, 10),
        nextRetry: nextRetry !== '0' ? new Date(parseInt(nextRetry, 10)) : undefined,
      };
    } catch (error) {
      this.logger.warn(`RC-16/RC-17: Lua script failed, using local fallback: ${(error as Error).message}`);
      this.degradedMode = true;
      return this.getCircuitStatus(accountId);
    }
  }

  /**
   * RC-19 FIX: Execute rate limit Lua script atomically
   * Returns { allowed, status } where allowed is true if request can proceed
   */
  private async executeRateLimitLuaScript(
    accountId: string,
    config: RateLimitConfig,
  ): Promise<{ allowed: boolean; status: RateLimitStatus }> {
    const key = `${this.RATE_LIMIT_KEY_PREFIX}${accountId}`;
    const now = Date.now();

    try {
      const result = await this.redis.eval(
        this.RATE_LIMIT_LUA_SCRIPT,
        1,
        key,
        now.toString(),
        config.requestsPerSecond.toString(),
        config.requestsPerMinute.toString(),
        config.cooldownMs.toString(),
      ) as string[];

      const [allowed, reqSec, reqMin, retryAfter] = result;
      const isAllowed = allowed === '1';

      return {
        allowed: isAllowed,
        status: {
          accountId,
          requestsThisSecond: parseInt(reqSec, 10),
          requestsThisMinute: parseInt(reqMin, 10),
          lastRequestAt: new Date(now),
          isLimited: !isAllowed,
          retryAfter: !isAllowed && retryAfter !== '0' ? new Date(parseInt(retryAfter, 10)) : undefined,
        },
      };
    } catch (error) {
      this.logger.warn(`RC-19: Rate limit Lua script failed, using local fallback: ${(error as Error).message}`);
      this.degradedMode = true;

      // Fall back to local rate limit check
      const status = this.checkRateLimit(accountId, config);
      if (!status.isLimited) {
        this.recordRequest(accountId);
      }
      return { allowed: !status.isLimited, status };
    }
  }

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
   * CRIT-4 FIX: Uses Redis for distributed state across multiple instances
   * RC-4/RC-5 Fix: Uses per-account mutex for atomic rate limit and circuit breaker checks (fallback)
   * RC-16/RC-17/RC-19 FIX: Uses Lua scripts for atomic operations
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

    // CRIT-4 FIX: Use Redis-backed distributed state when available
    let circuitOpen = false;
    let rateLimited = false;
    let rateLimitRetryAfter: Date | undefined;
    let circuitRetryAfter: Date | undefined;

    if (!this.degradedMode) {
      // RC-16/RC-17/RC-19 FIX: Use atomic Lua scripts for distributed checks
      try {
        // Atomic circuit breaker check
        const circuitStatus = await this.executeCircuitLuaScript(accountId, 'check', fullConfig.circuitBreaker);
        if (circuitStatus.state === 'open') {
          circuitOpen = true;
          circuitRetryAfter = circuitStatus.nextRetry;
        } else {
          // RC-19 FIX: Atomic rate limit check + increment (single Lua script)
          const { allowed, status: rateLimitStatus } = await this.executeRateLimitLuaScript(
            accountId,
            fullConfig.rateLimit,
          );
          if (!allowed) {
            rateLimited = true;
            rateLimitRetryAfter = rateLimitStatus.retryAfter;
          }
          // Note: Request already recorded atomically inside Lua script if allowed
        }
      } catch (error) {
        this.logger.warn(`CRIT-4: Distributed check failed, falling back to local: ${(error as Error).message}`);
        // Fall through to local mutex-based approach
        this.degradedMode = true;
      }
    }

    // Fallback: Use local mutex-based approach if Redis is unavailable
    if (this.degradedMode) {
      const mutex = this.getAccountMutex(accountId);
      await mutex.acquire();

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
            this.recordRequest(accountId);
          }
        }
      } finally {
        mutex.release();
      }
    }

    // Handle circuit open
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

    // Handle rate limited
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

        // RC-16/RC-17 FIX: Success - record using atomic Lua script or local fallback
        if (!this.degradedMode) {
          await this.executeCircuitLuaScript(accountId, 'success', fullConfig.circuitBreaker);
        } else {
          this.recordSuccess(accountId, fullConfig.circuitBreaker);
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

        // RC-19 FIX: Re-check rate limit before retry using atomic Lua script or local method
        let retryRateLimitStatus: RateLimitStatus;
        if (!this.degradedMode) {
          const { status } = await this.executeRateLimitLuaScript(accountId, fullConfig.rateLimit);
          retryRateLimitStatus = status;
        } else {
          retryRateLimitStatus = this.checkRateLimit(accountId, fullConfig.rateLimit);
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

    // RC-16/RC-17 FIX: All retries exhausted - record failure using atomic Lua script or local fallback
    if (!this.degradedMode) {
      await this.executeCircuitLuaScript(accountId, 'failure', fullConfig.circuitBreaker);
    } else {
      this.recordFailure(accountId, fullConfig.circuitBreaker);
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
  // Circuit Breaker (Local Fallback)
  // RC-16/RC-17: Primary operations now use Lua scripts above
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
  async resetCircuitBreaker(accountId: string): Promise<void> {
    this.circuits.delete(accountId);

    if (!this.degradedMode) {
      try {
        await this.redis.del(`${this.CIRCUIT_KEY_PREFIX}${accountId}`);
      } catch (error) {
        this.logger.warn(`CRIT-4: Redis circuit reset failed: ${(error as Error).message}`);
      }
    }

    this.logger.log(`Circuit breaker reset for account ${accountId}`);
  }

  // ============================================
  // Rate Limiting (Local Fallback)
  // RC-19: Primary operations now use Lua scripts above
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
  async resetRateLimit(accountId: string): Promise<void> {
    this.rateLimitBuckets.delete(accountId);

    if (!this.degradedMode) {
      try {
        await this.redis.del(`${this.RATE_LIMIT_KEY_PREFIX}${accountId}`);
      } catch (error) {
        this.logger.warn(`CRIT-4: Redis rate limit reset failed: ${(error as Error).message}`);
      }
    }

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
