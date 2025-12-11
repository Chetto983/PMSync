import { Module, Global } from '@nestjs/common';
import { ResilienceService } from './resilience.service';

/**
 * Resilience Module
 *
 * Provides shared resilience services for all email drivers.
 * Marked as @Global so it's available everywhere without explicit imports.
 *
 * Features:
 * - Retry with exponential backoff and jitter
 * - Per-account rate limiting
 * - Circuit breaker pattern
 * - Request timeouts
 * - Metrics tracking
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
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}
