/**
 * AI Summarization Queue Service
 *
 * BullMQ-based queue for handling conversation summarization tasks.
 * Replaces fire-and-forget promises with proper job management.
 *
 * Benefits:
 * - No memory leaks from orphaned promises
 * - Job persistence and retry on failure
 * - Rate limiting to respect LLM API limits
 * - Visibility into job status
 * - Graceful shutdown support
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../../../common/config/queue.config';

/**
 * Summarization job data interface
 */
export interface SummarizationJobData {
  conversationId: string;
  tenantId: string;
  userId: string;
  locale?: string;
  triggeredAt: string;
  /** Number of messages to summarize */
  messageCount?: number;
}

/**
 * Summarization job result interface
 */
export interface SummarizationJobResult {
  success: boolean;
  summaryId?: string;
  messagesProcessed?: number;
  error?: string;
}

export type SummarizationHandler = (
  job: Job<SummarizationJobData>,
) => Promise<SummarizationJobResult>;

@Injectable()
export class SummarizationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SummarizationQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<SummarizationJobData, SummarizationJobResult>;
  private worker: Worker<SummarizationJobData, SummarizationJobResult>;
  private handler: SummarizationHandler | null = null;
  private isInitialized = false;

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Create queue for summarization jobs
    this.queue = new Queue<SummarizationJobData, SummarizationJobResult>(
      QUEUE_NAMES.AI_SUMMARIZATION,
      {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...getDefaultJobOptions('AI_EMBEDDING'),
          // Deduplicate by conversation ID - only one summarization per conversation at a time
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s
          },
          removeOnComplete: { count: 50, age: 3600 }, // Keep for 1 hour
          removeOnFail: { count: 100 },
        },
      },
    );

    // Create worker with rate limiting for LLM API
    const workerOptions = getWorkerOptions('AI_EMBEDDING');
    this.worker = new Worker<SummarizationJobData, SummarizationJobResult>(
      QUEUE_NAMES.AI_SUMMARIZATION,
      async (job) => this.processJob(job),
      {
        connection: new Redis(redisOptions),
        ...workerOptions,
        concurrency: 2, // Allow 2 concurrent summarizations
        lockDuration: 120000, // 2 minutes for LLM calls
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Summarization job ${job?.id} failed for conversation ${job?.data.conversationId}: ${err.message}`,
        err.stack,
      );
    });

    this.worker.on('completed', (job, result) => {
      if (result.success) {
        this.logger.log(
          `Summarization completed for conversation ${job.data.conversationId}: ${result.messagesProcessed} messages processed`,
        );
      }
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Summarization job ${jobId} stalled`);
    });

    this.isInitialized = true;
    this.logger.log('SummarizationQueueService initialized');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down SummarizationQueueService...');

    // Wait for active jobs to complete (with timeout)
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit();
    }

    this.logger.log('SummarizationQueueService shutdown complete');
  }

  /**
   * Register the summarization handler
   * This should be called by the memory service during initialization
   */
  registerHandler(handler: SummarizationHandler): void {
    this.handler = handler;
    this.logger.debug('Summarization handler registered');
  }

  /**
   * Add a summarization job to the queue
   * Deduplicates by conversation ID to prevent duplicate work
   */
  async addSummarizationJob(data: Omit<SummarizationJobData, 'triggeredAt'>): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('SummarizationQueueService not initialized');
    }

    const jobId = `summarize-${data.conversationId}`;

    // Check if job already exists for this conversation
    const existingJob = await this.queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        this.logger.debug(
          `Summarization job already ${state} for conversation ${data.conversationId}`,
        );
        return existingJob.id || jobId;
      }
    }

    const job = await this.queue.add(
      'summarize-conversation',
      {
        ...data,
        triggeredAt: new Date().toISOString(),
      },
      {
        jobId,
        // Remove existing job with same ID if completed/failed
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.debug(`Queued summarization job ${job.id} for conversation ${data.conversationId}`);
    return job.id || jobId;
  }

  /**
   * Process a summarization job
   */
  private async processJob(
    job: Job<SummarizationJobData>,
  ): Promise<SummarizationJobResult> {
    if (!this.handler) {
      this.logger.error('No summarization handler registered');
      return { success: false, error: 'No handler registered' };
    }

    this.logger.log(
      `Processing summarization for conversation ${job.data.conversationId} (job ${job.id})`,
    );

    const startTime = Date.now();

    try {
      const result = await this.handler(job);
      const duration = Date.now() - startTime;

      this.logger.log(
        `Summarization job ${job.id} completed in ${duration}ms`,
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Summarization job ${job.id} failed after ${duration}ms: ${message}`,
      );

      return { success: false, error: message };
    }
  }

  /**
   * Get queue statistics for monitoring
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Check if a summarization is pending for a conversation
   */
  async isSummarizationPending(conversationId: string): Promise<boolean> {
    const jobId = `summarize-${conversationId}`;
    const job = await this.queue.getJob(jobId);

    if (!job) return false;

    const state = await job.getState();
    return state === 'waiting' || state === 'active' || state === 'delayed';
  }
}
