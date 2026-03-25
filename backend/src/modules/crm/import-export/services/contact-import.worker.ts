/**
 * CRM Contact Import Worker
 *
 * BullMQ processor for async CSV contact import.
 * Emits progress events via Socket.IO for real-time tracking.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { CsvImportService } from './csv-import.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../../../common/config';
import type { ColumnMapping, CsvImportResult } from '../types';

export interface ContactImportJobData {
  tenantId: string;
  csvContent: string;
  mappings: ColumnMapping[];
}

@Injectable()
export class ContactImportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactImportWorker.name);
  private worker!: Worker<ContactImportJobData>;

  constructor(
    private readonly csvImportService: CsvImportService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    getSharedRedisConnection(); // acquire ref
    this.worker = new Worker<ContactImportJobData>(
      QUEUE_NAMES.CRM_CONTACT_IMPORT,
      async (job: Job<ContactImportJobData>) => this.process(job),
      {
        connection: getRedisConnectionOptions(),
        concurrency: 1, // One import at a time to avoid DB contention
        lockDuration: 300_000, // 5 minutes for large files
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Import job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Contact import worker initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    releaseSharedRedisConnection();
  }

  private async process(job: Job<ContactImportJobData>): Promise<CsvImportResult> {
    const { tenantId, csvContent, mappings } = job.data;
    this.logger.log(`Processing import job ${job.id} for tenant ${tenantId}`);

    this.emitProgress(tenantId, job.id!, 'parsing', 0, 0, 0, 0, 0);

    try {
      const result = await this.csvImportService.importContacts(
        tenantId,
        csvContent,
        mappings,
        (processed, total) => {
          this.emitProgress(
            tenantId,
            job.id!,
            'importing',
            total,
            processed,
            0,
            0,
            0,
          );
        },
      );

      this.emitProgress(
        tenantId,
        job.id!,
        'completed',
        result.total,
        result.total,
        result.created,
        result.skipped,
        result.errors.length,
      );

      this.logger.log(
        `Import job ${job.id} completed: ${result.created} created, ${result.skipped} skipped`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Import job ${job.id} failed: ${error.message}`);
      this.emitProgress(tenantId, job.id!, 'failed', 0, 0, 0, 0, 1);
      throw error;
    }
  }

  private emitProgress(
    tenantId: string,
    jobId: string,
    status: 'parsing' | 'validating' | 'importing' | 'completed' | 'failed',
    total: number,
    processed: number,
    created: number,
    skipped: number,
    errorCount: number,
  ): void {
    this.realtimeEvents.emitCrmImportProgress(tenantId, {
      jobId,
      status,
      total,
      processed,
      created,
      skipped,
      errorCount,
      timestamp: new Date().toISOString(),
    });
  }
}
