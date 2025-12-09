import { Global, Module } from '@nestjs/common';
import { ScheduledJobsQueueService } from './scheduled-jobs.queue';

/**
 * Global module for BullMQ-based scheduled jobs
 * Provides ScheduledJobsQueueService to all modules without explicit imports
 */
@Global()
@Module({
  providers: [ScheduledJobsQueueService],
  exports: [ScheduledJobsQueueService],
})
export class ScheduledJobsModule {}
