import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Batch Indexing Service - STUB (Phase 23)
 *
 * The Mistral Batch API has no AI SDK equivalent. This service is now a
 * no-op stub that preserves the interface for sync services. Large-scale
 * email indexing should go through the BullMQ embedding queue with
 * AI SDK embedMany() instead.
 *
 * TODO(Phase 25+): Remove BatchIndexingService references from sync services
 * and delete this file entirely.
 */
@Injectable()
export class BatchIndexingService implements OnModuleInit {
  private readonly logger = new Logger(BatchIndexingService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.logger.warn(
      'BatchIndexingService is a no-op stub (Phase 23). ' +
        'Use BullMQ embedding queues for bulk operations.',
    );
  }

  /**
   * Stub: Always returns a synthetic job ID and logs a warning.
   * Callers should migrate to BullMQ embedding queues.
   */
  async queueBatchIndexing(tenantId: string, emailIds: string[]): Promise<string> {
    this.logger.warn(
      `[tenant:${tenantId}] BatchIndexingService.queueBatchIndexing() is a no-op. ` +
        `${emailIds.length} emails will NOT be batch-indexed. Use BullMQ queue instead.`,
    );
    return `noop-${Date.now()}`;
  }

  getJobStatus(_jobId: string): undefined {
    return undefined;
  }

  getPendingJobsForTenant(_tenantId: string): never[] {
    return [];
  }

  getConfig(): { enabled: boolean; embeddingMinSize: number } {
    return { enabled: false, embeddingMinSize: 100 };
  }
}
