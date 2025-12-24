import { Global, Module } from '@nestjs/common';
import { ScheduledJobsQueueService } from './scheduled-jobs.queue';
import { CronLockService } from './cron-lock.service';
import { RedisLockService } from './redis-lock.service';

/**
 * Global module for BullMQ-based scheduled jobs and distributed locking
 * Provides services to all modules without explicit imports
 *
 * RACE CONDITION FIX: Adds RedisLockService for distributed locking
 */
@Global()
@Module({
  providers: [ScheduledJobsQueueService, CronLockService, RedisLockService],
  exports: [ScheduledJobsQueueService, CronLockService, RedisLockService],
})
export class ScheduledJobsModule {}
