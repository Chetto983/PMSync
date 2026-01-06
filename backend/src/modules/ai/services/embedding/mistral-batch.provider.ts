import { Logger } from '@nestjs/common';
import { Mistral } from '@mistralai/mistralai';
import { AiError, AiErrorCode } from '../../errors';

/**
 * Mistral Batch Embedding Provider
 *
 * Uses Mistral Batch API for async processing:
 * - Lower cost than real-time API
 * - For non-urgent operations (email indexing, reindexing)
 * - Processes via JSONL file upload
 *
 * Use cases:
 * - Initial email corpus indexing
 * - Background reindexing
 * - Large batch operations (1000+ emails)
 *
 * @see https://docs.mistral.ai/capabilities/batch
 */
export interface BatchJob {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLATION_REQUESTED' | 'CANCELLED';
  createdAt: Date;
  model: string;
  inputFiles: string[];
  outputFile?: string | null;
  errorFile?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BatchEmbeddingRequest {
  customId: string;
  text: string;
}

export interface BatchEmbeddingResult {
  customId: string;
  embedding: number[];
  error?: string;
}

export class MistralBatchProvider {
  private readonly logger = new Logger(MistralBatchProvider.name);
  private client: Mistral | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'mistral-embed',
  ) {}

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('MISTRAL_API_KEY not set - batch operations will fail');
      return;
    }

    this.client = new Mistral({ apiKey: this.apiKey });
    this.logger.log(`Mistral batch provider initialized: ${this.model}`);
  }

  isReady(): boolean {
    return this.client !== null;
  }

  /**
   * Create batch embedding job
   *
   * @param requests - Array of texts with custom IDs
   * @param metadata - Optional metadata for tracking (e.g., tenantId, jobType)
   * @returns Job ID for polling
   */
  async createBatchJob(
    requests: BatchEmbeddingRequest[],
    metadata?: Record<string, string>,
  ): Promise<string> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    if (requests.length === 0) {
      throw new AiError('Empty batch request', AiErrorCode.INVALID_INPUT);
    }

    // Create JSONL content for batch API
    const jsonlContent = requests
      .map((req) =>
        JSON.stringify({
          custom_id: req.customId,
          body: {
            model: this.model,
            input: req.text,
          },
        }),
      )
      .join('\n');

    // Upload JSONL file
    const file = await this.client.files.upload({
      file: {
        fileName: `embeddings-${Date.now()}.jsonl`,
        content: Buffer.from(jsonlContent),
      },
      purpose: 'batch' as const,
    });

    // Create batch job
    const job = await this.client.batch.jobs.create({
      inputFiles: [file.id],
      model: this.model,
      endpoint: '/v1/embeddings',
      metadata,
    });

    this.logger.log(`Batch job created: ${job.id} (${requests.length} embeddings)`);
    return job.id;
  }

  /**
   * Get batch job status
   */
  async getJobStatus(jobId: string): Promise<BatchJob> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    const job = await this.client.batch.jobs.get({ jobId });

    return {
      id: job.id,
      status: job.status as BatchJob['status'],
      createdAt: new Date(job.createdAt),
      model: job.model ?? this.model,
      inputFiles: job.inputFiles,
      outputFile: job.outputFile ?? undefined,
      errorFile: job.errorFile ?? undefined,
      metadata: job.metadata ?? undefined,
    };
  }

  /**
   * Get batch job results
   *
   * @returns Array of embeddings with custom IDs
   */
  async getJobResults(jobId: string): Promise<BatchEmbeddingResult[]> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    const job = await this.getJobStatus(jobId);

    if (job.status !== 'SUCCESS') {
      throw new AiError(`Job not complete: ${job.status}`, AiErrorCode.PROVIDER_ERROR);
    }

    if (!job.outputFile) {
      throw new AiError('No output file for completed job', AiErrorCode.EMPTY_RESPONSE);
    }

    // Download output file - returns ReadableStream, need to convert to text
    const outputStream = await this.client.files.download({ fileId: job.outputFile });
    const reader = outputStream.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        chunks.push(result.value);
      }
    }
    const outputText = Buffer.concat(chunks).toString('utf-8');
    const lines = outputText.trim().split('\n');

    return lines.map((line: string) => {
      const result = JSON.parse(line);
      return {
        customId: result.custom_id,
        embedding: result.response?.data?.[0]?.embedding ?? [],
        error: result.error?.message,
      };
    });
  }

  /**
   * Cancel a running batch job
   */
  async cancelJob(jobId: string): Promise<void> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    await this.client.batch.jobs.cancel({ jobId });
    this.logger.log(`Batch job cancelled: ${jobId}`);
  }

  /**
   * List all batch jobs
   */
  async listJobs(
    options?: {
      status?: BatchJob['status'];
      limit?: number;
    },
  ): Promise<BatchJob[]> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    const response = await this.client.batch.jobs.list({
      status: options?.status ? [options.status] : undefined,
      pageSize: options?.limit ?? 20,
    });

    return (response.data ?? []).map((job) => ({
      id: job.id,
      status: job.status as BatchJob['status'],
      createdAt: new Date(job.createdAt),
      model: job.model ?? this.model,
      inputFiles: job.inputFiles,
      outputFile: job.outputFile ?? undefined,
      errorFile: job.errorFile ?? undefined,
      metadata: job.metadata ?? undefined,
    }));
  }
}
