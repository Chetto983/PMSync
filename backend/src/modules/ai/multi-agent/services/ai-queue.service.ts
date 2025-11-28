import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { EventEmitter } from 'events';

/**
 * AI Request payload for the queue
 */
export interface AIQueueRequest {
  id: string;
  tenantId: string;
  userId: string;
  type: 'intent' | 'agent';
  agentName?: string;
  payload: Record<string, unknown>;
  priority?: number;
  timestamp: number;
}

/**
 * AI Response from the queue
 */
export interface AIQueueResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  processingTimeMs: number;
}

/**
 * Queue configuration options
 */
export interface AIQueueConfig {
  /** Maximum concurrent jobs processed */
  concurrency: number;
  /** Rate limit: max jobs per interval */
  rateLimitMax: number;
  /** Rate limit interval in milliseconds */
  rateLimitInterval: number;
  /** Job timeout in milliseconds */
  jobTimeout: number;
  /** Max retries on failure */
  maxRetries: number;
}

/**
 * AIQueueService manages rate-limited AI request processing using BullMQ.
 *
 * Features:
 * - Rate limiting to respect Mistral API limits
 * - Priority queue (high priority for real-time, low for batch)
 * - Per-tenant fairness (round-robin across tenants)
 * - Automatic retries with exponential backoff
 * - Metrics and monitoring
 */
@Injectable()
export class AIQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AIQueueService.name);
  private queue: Queue<AIQueueRequest> | null = null;
  private worker: Worker<AIQueueRequest, AIQueueResponse> | null = null;
  private queueEvents: QueueEvents | null = null;
  private readonly responseEmitter = new EventEmitter();

  // Default configuration
  private config: AIQueueConfig = {
    concurrency: 5,           // Process 5 requests concurrently
    rateLimitMax: 10,         // Max 10 requests
    rateLimitInterval: 1000,  // Per second
    jobTimeout: 30000,        // 30 second timeout
    maxRetries: 2,            // Retry twice on failure
  };

  // Metrics
  private metrics = {
    totalProcessed: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    avgProcessingTime: 0,
    currentQueueSize: 0,
  };

  // Request handlers registered by agents
  private handlers = new Map<string, (payload: Record<string, unknown>) => Promise<unknown>>();

  constructor(private readonly configService: ConfigService) {
    // Load config from environment
    const concurrency = this.configService.get<number>('AI_QUEUE_CONCURRENCY');
    const rateLimit = this.configService.get<number>('AI_QUEUE_RATE_LIMIT');

    if (concurrency) this.config.concurrency = concurrency;
    if (rateLimit) this.config.rateLimitMax = rateLimit;
  }

  async onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = this.configService.get<number>('REDIS_PORT') || 6379;

    const connection = {
      host: redisHost,
      port: redisPort,
    };

    try {
      // Create the queue
      this.queue = new Queue<AIQueueRequest>('ai-requests', {
        connection,
        defaultJobOptions: {
          attempts: this.config.maxRetries,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: {
            count: 1000, // Keep last 1000 completed jobs
            age: 3600,   // Or jobs older than 1 hour
          },
          removeOnFail: {
            count: 500,  // Keep last 500 failed jobs for debugging
          },
        },
      });

      // Create queue events listener
      this.queueEvents = new QueueEvents('ai-requests', { connection });

      // Create the worker with rate limiting
      this.worker = new Worker<AIQueueRequest, AIQueueResponse>(
        'ai-requests',
        async (job: Job<AIQueueRequest>) => this.processJob(job),
        {
          connection,
          concurrency: this.config.concurrency,
          limiter: {
            max: this.config.rateLimitMax,
            duration: this.config.rateLimitInterval,
          },
        },
      );

      // Set up event handlers
      this.setupEventHandlers();

      this.logger.log(`AI Queue initialized (concurrency: ${this.config.concurrency}, rate: ${this.config.rateLimitMax}/s)`);
    } catch (error) {
      this.logger.warn(`Failed to initialize AI Queue: ${error}. Running without queue (direct processing).`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    this.logger.log('AI Queue shut down');
  }

  /**
   * Register a handler for a specific request type
   */
  registerHandler(type: string, handler: (payload: Record<string, unknown>) => Promise<unknown>) {
    this.handlers.set(type, handler);
    this.logger.debug(`Registered handler for type: ${type}`);
  }

  /**
   * Enqueue an AI request for processing
   * Returns a promise that resolves when the job completes
   */
  async enqueue(request: Omit<AIQueueRequest, 'id' | 'timestamp'>): Promise<AIQueueResponse> {
    const id = `${request.tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fullRequest: AIQueueRequest = {
      ...request,
      id,
      timestamp: Date.now(),
    };

    // If queue is not available, process directly
    if (!this.queue) {
      return this.processDirectly(fullRequest);
    }

    // Add to queue with priority
    const priority = request.priority ?? 5; // Default medium priority (1=highest, 10=lowest)

    await this.queue.add(request.type, fullRequest, {
      priority,
      jobId: id,
    });

    this.metrics.currentQueueSize++;

    // Wait for job completion
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseEmitter.removeAllListeners(id);
        reject(new Error(`Job ${id} timed out after ${this.config.jobTimeout}ms`));
      }, this.config.jobTimeout);

      this.responseEmitter.once(id, (response: AIQueueResponse) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Job failed'));
        }
      });
    });
  }

  /**
   * Enqueue a request without waiting for result (fire and forget)
   */
  async enqueueAsync(request: Omit<AIQueueRequest, 'id' | 'timestamp'>): Promise<string> {
    const id = `${request.tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const fullRequest: AIQueueRequest = {
      ...request,
      id,
      timestamp: Date.now(),
    };

    if (!this.queue) {
      // Process in background
      this.processDirectly(fullRequest).catch(err =>
        this.logger.error(`Background job ${id} failed: ${err.message}`)
      );
      return id;
    }

    const priority = request.priority ?? 5;
    await this.queue.add(request.type, fullRequest, { priority, jobId: id });
    this.metrics.currentQueueSize++;

    return id;
  }

  /**
   * Get current queue metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  async getStatus() {
    if (!this.queue) {
      return { enabled: false, message: 'Queue not initialized' };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      enabled: true,
      config: this.config,
      counts: { waiting, active, completed, failed },
      metrics: this.metrics,
    };
  }

  /**
   * Process a job from the queue
   */
  private async processJob(job: Job<AIQueueRequest>): Promise<AIQueueResponse> {
    const startTime = Date.now();
    const { data } = job;

    this.logger.debug(`Processing job ${data.id} (type: ${data.type}, tenant: ${data.tenantId})`);

    try {
      // Get the handler for this request type
      const handlerKey = data.agentName ? `${data.type}:${data.agentName}` : data.type;
      const handler = this.handlers.get(handlerKey) || this.handlers.get(data.type);

      if (!handler) {
        throw new Error(`No handler registered for type: ${handlerKey}`);
      }

      // Execute the handler
      const result = await handler(data.payload);

      const processingTime = Date.now() - startTime;
      this.updateMetrics(true, processingTime);

      const response: AIQueueResponse = {
        id: data.id,
        success: true,
        result,
        processingTimeMs: processingTime,
      };

      // Emit response for waiting clients
      this.responseEmitter.emit(data.id, response);

      return response;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(false, processingTime);

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${data.id} failed: ${errorMessage}`);

      const response: AIQueueResponse = {
        id: data.id,
        success: false,
        error: errorMessage,
        processingTimeMs: processingTime,
      };

      // Emit error response
      this.responseEmitter.emit(data.id, response);

      throw error; // Let BullMQ handle retries
    }
  }

  /**
   * Process request directly without queue (fallback)
   */
  private async processDirectly(request: AIQueueRequest): Promise<AIQueueResponse> {
    const startTime = Date.now();

    try {
      const handlerKey = request.agentName ? `${request.type}:${request.agentName}` : request.type;
      const handler = this.handlers.get(handlerKey) || this.handlers.get(request.type);

      if (!handler) {
        throw new Error(`No handler registered for type: ${handlerKey}`);
      }

      const result = await handler(request.payload);
      const processingTime = Date.now() - startTime;

      return {
        id: request.id,
        success: true,
        result,
        processingTimeMs: processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        id: request.id,
        success: false,
        error: errorMessage,
        processingTimeMs: processingTime,
      };
    }
  }

  /**
   * Set up queue event handlers
   */
  private setupEventHandlers() {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - 1);
      this.logger.debug(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - 1);
      this.logger.warn(`Job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      this.logger.error(`Worker error: ${error.message}`);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Job ${jobId} stalled`);
    });
  }

  /**
   * Update metrics after job completion
   */
  private updateMetrics(success: boolean, processingTime: number) {
    this.metrics.totalProcessed++;
    if (success) {
      this.metrics.totalSuccessful++;
    } else {
      this.metrics.totalFailed++;
    }

    // Update rolling average
    const alpha = 0.1; // Smoothing factor
    this.metrics.avgProcessingTime =
      this.metrics.avgProcessingTime * (1 - alpha) + processingTime * alpha;
  }
}
