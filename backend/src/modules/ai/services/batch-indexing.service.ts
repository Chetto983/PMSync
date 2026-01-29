import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralBatchProvider } from './embedding/mistral-batch.provider';
import { EmbeddingsService } from './embeddings.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { nanoid } from 'nanoid';

interface BatchIndexingJob {
  id: string;
  tenantId: string;
  batchJobId: string;
  emailIds: string[];
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Batch Indexing Service for Large-Scale Email Embedding
 *
 * Uses Mistral Batch API for:
 * - Initial corpus indexing (1000+ emails)
 * - Background reindexing
 * - Cost-effective bulk operations (50% cheaper)
 *
 * Flow:
 * 1. Queue emails for batch processing
 * 2. Create batch job via Mistral API
 * 3. Poll for completion
 * 4. Store results in database
 */
@Injectable()
export class BatchIndexingService implements OnModuleInit {
  private readonly logger = new Logger(BatchIndexingService.name);
  private readonly batchProvider: MistralBatchProvider;
  private readonly pendingJobs: Map<string, BatchIndexingJob> = new Map();
  private readonly enabled: boolean;
  private readonly embeddingMinSize: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CostProtectionService) private readonly costProtectionService?: CostProtectionService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
  ) {
    const apiKey = this.config.get<string>('MISTRAL_API_KEY');
    this.batchProvider = new MistralBatchProvider(apiKey || '');
    // P11 Phase 4: Use centralized ai.batch config (fallback to legacy env var)
    this.enabled =
      this.config.get<boolean>('ai.batch.enabled') ??
      this.config.get<string>('BATCH_INDEXING_ENABLED', 'true') !== 'false';
    this.embeddingMinSize = this.config.get<number>('ai.batch.embeddingMinSize') ?? 100;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Batch indexing disabled via MISTRAL_BATCH_ENABLED=false');
      return;
    }
    await this.batchProvider.initialize();
    this.logger.log('Batch indexing service initialized');
  }

  /**
   * Queue emails for batch indexing
   * Use when: Initial sync, reindexing, or N+ emails (configurable via MISTRAL_BATCH_EMBEDDING_MIN_SIZE)
   *
   * P10: Includes quota and cost cap validation before submitting batch
   */
  async queueBatchIndexing(tenantId: string, emailIds: string[]): Promise<string> {
    if (!this.batchProvider.isReady()) {
      throw new Error('Batch provider not initialized');
    }

    // P10: Pre-validate cost cap BEFORE batch indexing (prevents bankruptcy)
    if (this.costProtectionService) {
      const costCheck = await this.costProtectionService.canProceed(tenantId, 'embedding');
      if (!costCheck.allowed) {
        this.logger.warn(
          `[tenant:${tenantId}] Batch indexing blocked by cost cap: ${costCheck.reason}`,
        );
        throw new Error(costCheck.reason || 'Daily cost limit reached');
      }
    }

    // P10: Quota enforcement via CostProtectionService.canProceed() above
    // Note: usageTrackingService.checkQuota() is deprecated (always returns true)

    // P11 Phase 4: Use configurable threshold
    if (emailIds.length < this.embeddingMinSize) {
      this.logger.warn(
        `Batch indexing not efficient for <${this.embeddingMinSize} emails, use real-time instead`,
      );
    }

    // Fetch email content
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        subject: true,
        snippet: true,
        bodyText: true,
        from: true,
      },
    });

    // Prepare batch requests
    const requests = emails.map(email => ({
      customId: email.id,
      text: `${email.subject || ''}\n${email.snippet || email.bodyText?.substring(0, 500) || ''}\nFrom: ${email.from || ''}`,
    }));

    // Create batch job
    const batchJobId = await this.batchProvider.createBatchJob(requests, {
      tenantId,
      jobType: 'email_indexing',
    });

    // Track job
    const job: BatchIndexingJob = {
      id: nanoid(),
      tenantId,
      batchJobId,
      emailIds,
      status: 'PENDING',
      createdAt: new Date(),
    };
    this.pendingJobs.set(job.id, job);

    this.logger.log(`Batch indexing job created: ${batchJobId} for ${emailIds.length} emails`);
    return job.id;
  }

  /**
   * Poll pending batch jobs (runs every 5 minutes)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollPendingJobs() {
    if (!this.enabled || this.pendingJobs.size === 0) return;

    for (const [_jobId, job] of this.pendingJobs) {
      if (job.status !== 'PENDING' && job.status !== 'RUNNING') continue;

      try {
        const status = await this.batchProvider.getJobStatus(job.batchJobId);
        job.status = status.status === 'SUCCESS' ? 'SUCCESS' :
                     status.status === 'FAILED' ? 'FAILED' :
                     status.status === 'RUNNING' ? 'RUNNING' : 'PENDING';

        if (status.status === 'SUCCESS') {
          await this.processCompletedJob(job);
          job.completedAt = new Date();

          // P10: Track usage on successful completion
          if (this.usageTrackingService && job.emailIds.length > 0) {
            await this.usageTrackingService.trackUsage(job.tenantId, 'ai-calls', job.emailIds.length).catch((err: Error) => {
              this.logger.warn(`[tenant:${job.tenantId}] Failed to track batch indexing usage: ${err.message}`);
            });
          }

          this.logger.log(`Batch job ${job.batchJobId} completed successfully`);
        } else if (status.status === 'FAILED') {
          this.logger.error(`Batch job ${job.batchJobId} failed`);
          job.completedAt = new Date();
        }
      } catch (error) {
        this.logger.error(`Error polling job ${job.batchJobId}:`, error);
      }
    }

    // Cleanup old completed jobs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [jobId, job] of this.pendingJobs) {
      if (job.completedAt && job.completedAt < oneHourAgo) {
        this.pendingJobs.delete(jobId);
      }
    }
  }

  private async processCompletedJob(job: BatchIndexingJob) {
    try {
      const results = await this.batchProvider.getJobResults(job.batchJobId);

      let saved = 0;
      for (const result of results) {
        if (result.embedding && !result.error) {
          // Find original email for metadata
          const email = await this.prisma.email.findFirst({
            where: { id: result.customId, tenantId: job.tenantId },
            select: { subject: true, from: true, receivedAt: true },
          });

          await this.embeddingsService.saveEmbedding({
            tenantId: job.tenantId,
            embedding: result.embedding,
            model: 'mistral-embed',
            documentName: email?.subject || undefined,
            metadata: {
              source: 'email',
              emailId: result.customId,
              indexedVia: 'batch_api',
            },
          });
          saved++;
        }
      }

      this.logger.log(`Batch job ${job.batchJobId}: saved ${saved}/${results.length} embeddings`);
    } catch (error) {
      this.logger.error(`Error processing batch results:`, error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): BatchIndexingJob | undefined {
    return this.pendingJobs.get(jobId);
  }

  /**
   * Get all pending jobs for a tenant
   */
  getPendingJobsForTenant(tenantId: string): BatchIndexingJob[] {
    return Array.from(this.pendingJobs.values())
      .filter(job => job.tenantId === tenantId);
  }

  /**
   * P11 Phase 4: Expose config for testing
   */
  getConfig(): { enabled: boolean; embeddingMinSize: number } {
    return {
      enabled: this.enabled,
      embeddingMinSize: this.embeddingMinSize,
    };
  }
}
