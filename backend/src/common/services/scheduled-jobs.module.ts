import { Global, Module } from '@nestjs/common';
import { ScheduledJobsQueueService } from './scheduled-jobs.queue';
import { RedisLockService } from './redis-lock.service';
import { DataCleanupService } from './data-cleanup.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Global module for BullMQ-based scheduled jobs and distributed locking
 * Provides services to all modules without explicit imports
 *
 * PHASE 4 CONSOLIDATION: Removed CronLockService (redundant with RedisLockService)
 * RedisLockService provides distributed locking for all use cases
 *
 * DataCleanupService: Daily cleanup of expired data (AIMemory, Learning, Actions)
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ScheduledJobsQueueService, RedisLockService, DataCleanupService],
  exports: [ScheduledJobsQueueService, RedisLockService, DataCleanupService],
})
export class ScheduledJobsModule {}
