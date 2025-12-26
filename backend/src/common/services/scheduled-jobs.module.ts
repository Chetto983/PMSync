import { Global, Module } from '@nestjs/common';
import { ScheduledJobsQueueService } from './scheduled-jobs.queue';
import { RedisLockService } from './redis-lock.service';

/**
 * Global module for BullMQ-based scheduled jobs and distributed locking
 * Provides services to all modules without explicit imports
 *
 * PHASE 4 CONSOLIDATION: Removed CronLockService (redundant with RedisLockService)
 * RedisLockService provides distributed locking for all use cases
 */
@Global()
@Module({
  providers: [ScheduledJobsQueueService, RedisLockService],
  exports: [ScheduledJobsQueueService, RedisLockService],
})
export class ScheduledJobsModule {}
