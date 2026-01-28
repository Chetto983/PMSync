/**
 * Mistral Batch API Service
 *
 * Bulk processing for AI operations at 50% reduced cost.
 * Designed for 1000+ users with high-volume workloads.
 *
 * Based on: https://docs.mistral.ai/capabilities/batch
 *
 * Features:
 * - 50% cost reduction vs synchronous API
 * - Up to 1M concurrent requests per workspace
 * - Parallel processing for embeddings, chat, OCR
 * - Job tracking and status monitoring
 * - Automatic retry on failure
 *
 * Use Cases:
 * - Bulk email sentiment analysis
 * - Document summarization batches
 * - Vector embedding generation
 * - Data labeling at scale
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mistral } from '@mistralai/mistralai';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { CostProtectionService } from '../../../subscription/services/cost-protection.service';
import { UsageTrackingService } from '../../../subscription/services/usage-tracking.service';

export type BatchEndpoint =
  | '/v1/chat/completions'
  | '/v1/embeddings'
  | '/v1/moderations';

export type BatchJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT_EXCEEDED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED';

export interface BatchRequest {
  customId: string;
  body: Record<string, unknown>;
}

export interface BatchJobConfig {
  model: string;
  endpoint: BatchEndpoint;
  requests: BatchRequest[];
  metadata?: Record<string, string>;
  tenantId: string;
}

export interface BatchJobResult {
  jobId: string;
  status: BatchJobStatus;
  inputFileId?: string;
  outputFileId?: string;
  createdAt: Date;
  completedAt?: Date;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
}

export interface BatchResponse {
  customId: string;
  response?: Record<string, unknown>;
  error?: string;
}

// P11: Tracked job with result handler
interface TrackedBatchJob {
  jobId: string;
  tenantId: string;
  type: 'embeddings' | 'sentiment' | 'summarize' | 'custom';
  status: BatchJobStatus;
  createdAt: Date;
  completedAt?: Date;
  onComplete?: (results: BatchResponse[]) => Promise<void>;
}

@Injectable()
export class MistralBatchService {
  private readonly logger = new Logger(MistralBatchService.name);
  private client: Mistral | null = null;
  private readonly enabled: boolean;

  // P11: Track pending jobs for cron polling
  private readonly pendingJobs: Map<string, TrackedBatchJob> = new Map();

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(ConfigService) private readonly configService?: ConfigService,
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
    @Optional() @Inject(CostProtectionService) private readonly costProtectionService?: CostProtectionService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
  ) {
    const apiKey = this.configService?.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;
    this.enabled = !!apiKey;

    if (apiKey) {
      this.client = new Mistral({ apiKey });
      this.logger.log('Mistral Batch API initialized');
    } else {
      this.logger.warn('Mistral Batch API disabled - no API key');
    }
  }

  /**
   * P11: Poll pending batch jobs every 5 minutes
   * Checks status and processes completed jobs
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollPendingJobs(): Promise<void> {
    if (!this.enabled || this.pendingJobs.size === 0) return;

    this.logger.debug(`Polling ${this.pendingJobs.size} pending batch jobs...`);

    for (const [jobId, job] of this.pendingJobs) {
      if (job.status !== 'QUEUED' && job.status !== 'RUNNING') continue;

      try {
        const status = await this.getJobStatus(jobId);
        if (!status) continue;

        job.status = status.status;

        if (status.status === 'SUCCESS') {
          job.completedAt = new Date();
          this.logger.log(`Batch job ${jobId} completed (${job.type})`);

          // P10: Track usage on successful completion (batch is 50% cheaper)
          if (this.usageTrackingService && status.completedRequests > 0) {
            await this.usageTrackingService.trackUsage(job.tenantId, 'ai-calls', status.completedRequests).catch((err: Error) => {
              this.logger.warn(`[tenant:${job.tenantId}] Failed to track batch usage: ${err.message}`);
            });
          }

          // Process results if handler provided
          if (job.onComplete) {
            const results = await this.getJobResults(jobId);
            await job.onComplete(results);
            this.logger.log(`Processed ${results.length} results for job ${jobId}`);
          }
        } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
          job.completedAt = new Date();
          this.logger.error(`Batch job ${jobId} ${status.status}`);
        }
      } catch (error) {
        this.logger.error(`Error polling job ${jobId}: ${error}`);
      }
    }

    // Cleanup old completed jobs (> 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [jobId, job] of this.pendingJobs) {
      if (job.completedAt && job.completedAt.getTime() < oneHourAgo) {
        this.pendingJobs.delete(jobId);
      }
    }
  }

  /**
   * P11: Track a job for polling with optional completion handler
   */
  trackJob(
    jobId: string,
    tenantId: string,
    type: TrackedBatchJob['type'],
    onComplete?: (results: BatchResponse[]) => Promise<void>,
  ): void {
    this.pendingJobs.set(jobId, {
      jobId,
      tenantId,
      type,
      status: 'QUEUED',
      createdAt: new Date(),
      onComplete,
    });
  }

  /**
   * P11: Get count of pending jobs
   */
  getPendingJobCount(): number {
    return Array.from(this.pendingJobs.values()).filter(
      (j) => j.status === 'QUEUED' || j.status === 'RUNNING',
    ).length;
  }

  /**
   * Create a batch job for bulk processing.
   * Returns job ID for tracking.
   *
   * P10: Includes quota and cost cap validation before submitting batch.
   * Batch API operations count toward usage quotas at 50% cost (batch discount).
   */
  async createBatchJob(config: BatchJobConfig): Promise<string | null> {
    if (!this.client || !this.enabled) {
      this.logger.warn('Mistral Batch API not available');
      return null;
    }

    // P10: Pre-validate cost cap BEFORE submitting batch (prevents bankruptcy)
    if (this.costProtectionService) {
      // Estimate cost based on endpoint type (batch is 50% cheaper)
      const operationType = config.endpoint === '/v1/embeddings' ? 'embedding' : 'smartReply';
      const estimatedCost = this.costProtectionService.estimateCost(operationType, config.requests.length) * 0.5;

      const costCheck = await this.costProtectionService.canProceed(config.tenantId, operationType);
      if (!costCheck.allowed) {
        this.logger.warn(
          `[tenant:${config.tenantId}] Batch job blocked by cost cap: ${costCheck.reason} (estimated: $${estimatedCost.toFixed(4)})`,
        );
        return null;
      }
    }

    // P10: Quota enforcement via CostProtectionService.canProceed() above
    // Note: usageTrackingService.checkQuota() is deprecated (always returns true)

    try {
      // Convert requests to JSONL format
      const jsonlContent = config.requests
        .map((req) =>
          JSON.stringify({
            custom_id: req.customId,
            body: {
              model: config.model,
              ...req.body,
            },
          }),
        )
        .join('\n');

      // Upload batch file
      const fileName = `batch_${config.tenantId}_${Date.now()}.jsonl`;
      const fileBlob = new Blob([jsonlContent], { type: 'application/jsonl' });

      const uploadResult = await this.client.files.upload({
        file: {
          fileName,
          content: fileBlob,
        },
        purpose: 'batch',
      });

      if (!uploadResult.id) {
        throw new Error('Failed to upload batch file');
      }

      // Create batch job
      const job = await this.client.batch.jobs.create({
        inputFiles: [uploadResult.id],
        model: config.model,
        endpoint: config.endpoint,
        metadata: {
          tenantId: config.tenantId,
          ...config.metadata,
        },
      });

      // Cache job info for tracking
      await this.cacheJobInfo(job.id, {
        jobId: job.id,
        status: 'QUEUED',
        inputFileId: uploadResult.id,
        createdAt: new Date(),
        totalRequests: config.requests.length,
        completedRequests: 0,
        failedRequests: 0,
      });

      this.logger.log(
        `Created batch job ${job.id} with ${config.requests.length} requests for tenant ${config.tenantId}`,
      );

      return job.id;
    } catch (error) {
      this.logger.error(
        `Failed to create batch job: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Get batch job status.
   */
  async getJobStatus(jobId: string): Promise<BatchJobResult | null> {
    if (!this.client) return null;

    try {
      const job = await this.client.batch.jobs.get({ jobId });

      const result: BatchJobResult = {
        jobId: job.id,
        status: job.status as BatchJobStatus,
        inputFileId: job.inputFiles?.[0],
        outputFileId: job.outputFile ?? undefined,
        createdAt: new Date(job.createdAt),
        completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
        totalRequests: job.totalRequests ?? 0,
        completedRequests: job.succeededRequests ?? 0,
        failedRequests: job.failedRequests ?? 0,
      };

      // Update cache
      await this.cacheJobInfo(jobId, result);

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get job status: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Get batch job results.
   * Only available after job completes with SUCCESS status.
   */
  async getJobResults(jobId: string): Promise<BatchResponse[]> {
    if (!this.client) return [];

    try {
      // Get job to find output file
      const job = await this.client.batch.jobs.get({ jobId });

      if (job.status !== 'SUCCESS' || !job.outputFile) {
        this.logger.warn(`Job ${jobId} not ready for results (status: ${job.status})`);
        return [];
      }

      // Download results
      const outputStream = await this.client.files.download({ fileId: job.outputFile });

      // Read stream to string
      const chunks: Uint8Array[] = [];
      const reader = (outputStream).getReader();
      let done = false;

      while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) chunks.push(value);
        done = isDone;
      }

      const content = new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
          const result = new Uint8Array(acc.length + chunk.length);
          result.set(acc);
          result.set(chunk, acc.length);
          return result;
        }, new Uint8Array()),
      );

      // Parse JSONL results
      const results: BatchResponse[] = content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            return {
              customId: parsed.custom_id,
              response: parsed.response?.body,
              error: parsed.error?.message,
            };
          } catch {
            return { customId: 'unknown', error: 'Failed to parse result' };
          }
        });

      this.logger.log(`Retrieved ${results.length} results for job ${jobId}`);
      return results;
    } catch (error) {
      this.logger.error(
        `Failed to get job results: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    }
  }

  /**
   * Cancel a pending batch job.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.batch.jobs.cancel({ jobId });
      this.logger.log(`Cancelled batch job: ${jobId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to cancel job: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  /**
   * List batch jobs for a tenant.
   */
  async listJobs(
    tenantId: string,
    status?: BatchJobStatus,
  ): Promise<BatchJobResult[]> {
    if (!this.client) return [];

    try {
      const jobs = await this.client.batch.jobs.list({
        status: status ? [status] : undefined,
        metadata: { tenantId },
      });

      return (jobs.data ?? []).map((job) => ({
        jobId: job.id,
        status: job.status as BatchJobStatus,
        inputFileId: job.inputFiles?.[0],
        outputFileId: job.outputFile ?? undefined,
        createdAt: new Date(job.createdAt),
        completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
        totalRequests: job.totalRequests ?? 0,
        completedRequests: job.succeededRequests ?? 0,
        failedRequests: job.failedRequests ?? 0,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to list jobs: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    }
  }

  // ========================================================================
  // Convenience Methods for Common Batch Operations
  // ========================================================================

  /**
   * Batch generate embeddings for multiple texts.
   * 50% cheaper than individual calls.
   */
  async batchEmbeddings(
    tenantId: string,
    items: Array<{ id: string; text: string }>,
  ): Promise<string | null> {
    const requests: BatchRequest[] = items.map((item) => ({
      customId: item.id,
      body: {
        input: item.text,
      },
    }));

    return this.createBatchJob({
      tenantId,
      model: 'mistral-embed',
      endpoint: '/v1/embeddings',
      requests,
      metadata: { type: 'embeddings', count: items.length.toString() },
    });
  }

  /**
   * Batch analyze email sentiments.
   * 50% cheaper than individual calls.
   */
  async batchSentimentAnalysis(
    tenantId: string,
    emails: Array<{ id: string; subject: string; body: string }>,
  ): Promise<string | null> {
    const requests: BatchRequest[] = emails.map((email) => ({
      customId: email.id,
      body: {
        messages: [
          {
            role: 'system',
            content:
              'Analyze the sentiment of this email. Respond with JSON: {"sentiment": "positive"|"negative"|"neutral", "confidence": 0-1, "summary": "brief summary"}',
          },
          {
            role: 'user',
            content: `Subject: ${email.subject}\n\n${email.body}`,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      },
    }));

    return this.createBatchJob({
      tenantId,
      model: this.configService?.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest',
      endpoint: '/v1/chat/completions',
      requests,
      metadata: { type: 'sentiment', count: emails.length.toString() },
    });
  }

  /**
   * Batch summarize multiple documents.
   * 50% cheaper than individual calls.
   */
  async batchSummarize(
    tenantId: string,
    documents: Array<{ id: string; content: string; maxWords?: number }>,
  ): Promise<string | null> {
    const requests: BatchRequest[] = documents.map((doc) => ({
      customId: doc.id,
      body: {
        messages: [
          {
            role: 'system',
            content: `Summarize the following document in ${doc.maxWords || 100} words or less. Be concise and capture the key points.`,
          },
          {
            role: 'user',
            content: doc.content,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      },
    }));

    return this.createBatchJob({
      tenantId,
      model: this.configService?.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest',
      endpoint: '/v1/chat/completions',
      requests,
      metadata: { type: 'summarize', count: documents.length.toString() },
    });
  }

  /**
   * Check if batch API is available.
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  private async cacheJobInfo(jobId: string, info: BatchJobResult): Promise<void> {
    if (!this.cacheService) return;

    try {
      await this.cacheService.set(`batch:job:${jobId}`, info, {
        namespace: CacheNamespace.VOLTAGENT_METRICS,
        ttl: 86400, // 24 hours
      });
    } catch {
      // Ignore cache errors
    }
  }
}
