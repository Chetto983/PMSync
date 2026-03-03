import { Global, Module } from '@nestjs/common';
import { ScheduledJobsQueueService } from './scheduled-jobs.queue';
import { RedisLockService } from './redis-lock.service';
import { DataCleanupService } from './data-cleanup.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ComplianceModule } from '../../modules/compliance/compliance.module';

/**
 * Global module for BullMQ-based scheduled jobs and distributed locking
 * Provides services to all modules without explicit imports
 *
 * PHASE 4 CONSOLIDATION: Removed CronLockService (redundant with RedisLockService)
 * RedisLockService provides distributed locking for all use cases
 *
 * DataCleanupService: Daily cleanup of expired data (AIMemory, Learning, Actions)
 * AccountDeletionService: Purge expired account deletion requests (2 AM daily)
 *
 * Phase 32: Changed forwardRef(() => ComplianceModule) to direct import.
 * ComplianceModule does NOT import ScheduledJobsModule, so no circular dependency exists.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    ComplianceModule, // Phase 32: Direct import (no circular -- ComplianceModule doesn't import ScheduledJobsModule)
  ],
  providers: [ScheduledJobsQueueService, RedisLockService, DataCleanupService],
  exports: [ScheduledJobsQueueService, RedisLockService, DataCleanupService],
})
export class ScheduledJobsModule {}
