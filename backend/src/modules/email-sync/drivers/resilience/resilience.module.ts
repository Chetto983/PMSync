import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResilienceService } from './resilience.service';

/**
 * Resilience Module
 *
 * CRIT-4 FIX: Now uses Redis-backed distributed state for horizontal scaling.
 *
 * Provides shared resilience services for all email drivers.
 * Marked as @Global so it's available everywhere without explicit imports.
 *
 * Features:
 * - Retry with exponential backoff and jitter
 * - Per-account rate limiting (Redis-backed for distributed coordination)
 * - Circuit breaker pattern (Redis-backed for distributed coordination)
 * - Request timeouts
 * - Metrics tracking
 * - Graceful degradation to local state when Redis is unavailable
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private resilience: ResilienceService) {}
 *
 *   async myMethod() {
 *     const result = await this.resilience.executeWithResilience(
 *       'account-123',
 *       'google',
 *       () => this.apiCall(),
 *     );
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}
