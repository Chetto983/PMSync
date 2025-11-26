import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

/**
 * Guard that implements rate limiting for AI endpoints.
 *
 * This protects against:
 * - Excessive API costs from LLM calls
 * - Denial of service attacks
 * - Runaway processes making too many AI requests
 *
 * Rate limits are configurable via environment variables:
 * - AI_RATE_LIMIT_RPM: Requests per minute (default: 30)
 * - AI_RATE_LIMIT_RPD: Requests per day (default: 1000)
 */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AiRateLimitGuard.name);

  // Default rate limits (can be overridden by config)
  private readonly DEFAULT_RPM = 30;
  private readonly DEFAULT_RPD = 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const tenantId = request.user?.tenantId;

    // Skip rate limiting for unauthenticated requests (will fail auth guard anyway)
    if (!userId || !tenantId) {
      return true;
    }

    // Check if cache is healthy - if not, allow requests (graceful degradation)
    if (!this.cacheService.isHealthy()) {
      this.logger.warn('Redis not connected, skipping rate limit check');
      return true;
    }

    const rpmLimit = this.configService.get<number>('AI_RATE_LIMIT_RPM') || this.DEFAULT_RPM;
    const rpdLimit = this.configService.get<number>('AI_RATE_LIMIT_RPD') || this.DEFAULT_RPD;

    // Check per-minute rate
    const minuteKey = `ai:${tenantId}:${userId}:minute:${this.getCurrentMinuteKey()}`;
    const minuteCount = await this.incrementCounter(minuteKey, 60);

    if (minuteCount > rpmLimit) {
      this.logger.warn(
        `Rate limit exceeded for user ${userId} (tenant ${tenantId}): ${minuteCount}/${rpmLimit} requests/minute`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'AI rate limit exceeded. Please wait a moment before making another request.',
          retryAfter: 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check per-day rate
    const dayKey = `ai:${tenantId}:${userId}:day:${this.getCurrentDayKey()}`;
    const dayCount = await this.incrementCounter(dayKey, 86400);

    if (dayCount > rpdLimit) {
      this.logger.warn(
        `Daily rate limit exceeded for user ${userId} (tenant ${tenantId}): ${dayCount}/${rpdLimit} requests/day`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily AI request limit exceeded. Your limit will reset at midnight.',
          retryAfter: this.getSecondsUntilMidnight(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Increment a rate limit counter in cache
   */
  private async incrementCounter(key: string, ttlSeconds: number): Promise<number> {
    try {
      // Get current value
      const current = await this.cacheService.get<number>(key, {
        namespace: CacheNamespace.RATE_LIMIT,
      });

      const newValue = (current || 0) + 1;

      // Set with TTL
      await this.cacheService.set(key, newValue, {
        namespace: CacheNamespace.RATE_LIMIT,
        ttl: ttlSeconds,
      });

      return newValue;
    } catch (error) {
      // If cache fails, allow the request but log the error
      this.logger.error(
        `Failed to check rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return 0;
    }
  }

  /**
   * Get current minute key for rate limiting (changes every minute)
   */
  private getCurrentMinuteKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }

  /**
   * Get current day key for rate limiting (changes every day)
   */
  private getCurrentDayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Calculate seconds until midnight (for retry-after header)
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
  }
}
