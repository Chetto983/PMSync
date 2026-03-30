import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { WebhookValidationService } from './webhook-validation.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { MemoryManagerService } from './memory-manager.service';
import { RedisConnectionService } from './redis-connection.service';
import { OpsAlertService } from './ops-alert.service';

/**
 * CacheModule
 *
 * Global module that provides Redis-based caching, webhook validation,
 * and dead letter queue throughout the application. Marked as @Global so it
 * can be imported once in AppModule and used everywhere.
 *
 * Services:
 * - CacheService: Redis-based caching for horizontal scaling
 * - WebhookValidationService: Centralized webhook authentication
 * - DeadLetterQueueService: Failed job handling and retry logic
 *
 * Usage in AppModule:
 * ```typescript
 * import { CacheModule } from './common/services/cache.module';
 *
 * @Module({
 *   imports: [CacheModule, ...],
 * })
 * export class AppModule {}
 * ```
 *
 * Then inject services in any module:
 * ```typescript
 * constructor(
 *   private readonly cache: CacheService,
 *   private readonly webhookValidation: WebhookValidationService,
 *   private readonly dlq: DeadLetterQueueService,
 * ) {}
 * ```
 */
@Global()
@Module({
  providers: [RedisConnectionService, CacheService, WebhookValidationService, DeadLetterQueueService, MemoryManagerService, OpsAlertService],
  exports: [RedisConnectionService, CacheService, WebhookValidationService, DeadLetterQueueService, MemoryManagerService, OpsAlertService],
})
export class CacheModule {}
