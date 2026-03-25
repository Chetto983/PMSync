/**
 * CRM Contact Import Queue Service
 *
 * Manages the BullMQ queue for async CSV import jobs.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnectionOptions } from '../../../../common/config';
import type { ContactImportJobData } from './contact-import.worker';

export interface ImportJobInfo {
  jobId: string;
}

@Injectable()
export class ContactImportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactImportQueueService.name);
  private queue!: Queue<ContactImportJobData>;

  async onModuleInit(): Promise<void> {
    this.queue = new Queue<ContactImportJobData>(
      QUEUE_NAMES.CRM_CONTACT_IMPORT,
      {
        connection: getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 1, // Import is not idempotent — don't retry
          removeOnComplete: { count: 20 },
          removeOnFail: { count: 50 },
        },
      },
    );
    this.logger.log('Contact import queue initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueueImport(data: ContactImportJobData): Promise<ImportJobInfo> {
    const job = await this.queue.add('contact-import', data);
    this.logger.log(`Import job enqueued: ${job.id} for tenant ${data.tenantId}`);
    return { jobId: job.id! };
  }
}
