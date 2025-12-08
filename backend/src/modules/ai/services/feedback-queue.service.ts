/**
 * FeedbackQueueService
 *
 * BullMQ queue service for processing AI feedback signals.
 * Enables continuous learning from user interactions with AI-generated content.
 *
 * Key Features:
 * - Multiple feedback signal types (accept, reject, edit, rating)
 * - Batch aggregation for efficient model updates
 * - Delayed processing to capture edits after acceptance
 * - Privacy-preserving signal collection
 * - Writing style learning integration
 *
 * Feedback Signal Types:
 * - draft-accepted: User sent AI-generated draft as-is
 * - draft-edited: User modified AI draft before sending
 * - draft-rejected: User discarded AI suggestion
 * - suggestion-copied: User copied AI text
 * - explicit-rating: User gave thumbs up/down
 * - tone-preference: User selected different tone
 * - summary-feedback: User marked summary as helpful/not helpful
 *
 * Usage:
 * ```typescript
 * // Record draft acceptance
 * await feedbackQueue.recordFeedback({
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   signalType: 'draft-accepted',
 *   context: {
 *     draftId: 'draft-789',
 *     emailType: 'reply',
 *     originalPrompt: 'Reply professionally',
 *   },
 * });
 *
 * // Record with edit diff
 * await feedbackQueue.recordFeedback({
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   signalType: 'draft-edited',
 *   context: {
 *     draftId: 'draft-789',
 *     editDistance: 0.15, // 15% changed
 *     sectionsEdited: ['greeting', 'closing'],
 *   },
 * });
 * ```
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config';

/**
 * Types of feedback signals
 */
export type FeedbackSignalType =
  | 'draft-accepted'
  | 'draft-edited'
  | 'draft-rejected'
  | 'suggestion-copied'
  | 'explicit-rating'
  | 'tone-preference'
  | 'summary-feedback'
  | 'classification-correction'
  | 'priority-override';

/**
 * Feedback context for draft-related signals
 */
export interface DraftFeedbackContext {
  draftId: string;
  emailType: 'compose' | 'reply' | 'forward';
  originalPrompt?: string;
  /** 0.0 - 1.0 representing edit distance */
  editDistance?: number;
  /** Which sections were edited */
  sectionsEdited?: string[];
  /** Time spent editing (ms) */
  editDurationMs?: number;
  /** Final tone used */
  finalTone?: string;
  /** Word count change */
  wordCountDelta?: number;
}

/**
 * Feedback context for explicit ratings
 */
export interface RatingFeedbackContext {
  /** 1-5 or thumbs up/down */
  rating: number | 'up' | 'down';
  /** What was rated */
  ratedItem: 'draft' | 'summary' | 'classification' | 'suggestion';
  /** Item ID */
  itemId: string;
  /** Optional user comment */
  comment?: string;
}

/**
 * Feedback context for classification corrections
 */
export interface ClassificationFeedbackContext {
  emailId: string;
  originalCategory: string;
  correctedCategory: string;
  originalPriority?: number;
  correctedPriority?: number;
}

/**
 * Union type for all feedback contexts
 */
export type FeedbackContext =
  | DraftFeedbackContext
  | RatingFeedbackContext
  | ClassificationFeedbackContext
  | Record<string, unknown>;

/**
 * Feedback job data
 */
export interface FeedbackJobData {
  tenantId: string;
  userId: string;
  signalType: FeedbackSignalType;
  context: FeedbackContext;
  /** Timestamp when feedback was captured */
  capturedAt: string;
  /** Session ID for grouping related signals */
  sessionId?: string;
  /** Provider context (for provider-specific learning) */
  providerId?: string;
  providerType?: 'google' | 'microsoft' | 'imap';
}

/**
 * Aggregated feedback for batch processing
 */
export interface AggregatedFeedback {
  tenantId: string;
  userId: string;
  period: {
    start: string;
    end: string;
  };
  signals: {
    draftsAccepted: number;
    draftsEdited: number;
    draftsRejected: number;
    avgEditDistance: number;
    positiveRatings: number;
    negativeRatings: number;
    preferredTones: Record<string, number>;
    sectionsOftenEdited: Record<string, number>;
  };
}

/**
 * Feedback job result
 */
export interface FeedbackJobResult {
  processed: boolean;
  learningUpdated: boolean;
  writingStyleUpdated: boolean;
  aggregationTriggered: boolean;
}

/**
 * Queue metrics
 */
export interface FeedbackQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  signalCounts: Record<FeedbackSignalType, number>;
  avgProcessingTimeMs: number;
}

interface InternalMetrics {
  completed: number;
  failed: number;
  totalProcessingTimeMs: number;
  signalCounts: Record<string, number>;
}

@Injectable()
export class FeedbackQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<FeedbackJobData, FeedbackJobResult>;
  private queueEvents: QueueEvents;

  /** Buffer for batching signals before queueing */
  private signalBuffer: Map<string, FeedbackJobData[]> = new Map();
  private bufferFlushInterval: ReturnType<typeof setInterval>;

  private readonly metrics: InternalMetrics = {
    completed: 0,
    failed: 0,
    totalProcessingTimeMs: 0,
    signalCounts: {},
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for feedback queue at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Use LOW priority defaults (background learning)
    const jobDefaults = getDefaultJobOptions('LOW');

    this.queue = new Queue<FeedbackJobData, FeedbackJobResult>(QUEUE_NAMES.FEEDBACK, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...jobDefaults,
        attempts: 2, // Feedback loss is acceptable
        backoff: {
          type: 'fixed',
          delay: 30000, // 30 seconds
        },
        // Keep for analytics
        removeOnComplete: {
          age: 30 * 24 * 3600, // 30 days
          count: 10000,
        },
      },
    });

    this.setupQueueEvents();
    this.startBufferFlush();

    this.logger.log('Feedback queue initialized successfully');
  }

  private setupQueueEvents() {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.FEEDBACK, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Feedback job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.debug(`Feedback job ${jobId} failed: ${failedReason}`);
      this.metrics.failed++;
    });
  }

  /**
   * Start interval to flush signal buffer.
   * Batches signals together for efficient processing.
   */
  private startBufferFlush() {
    // Flush buffer every 5 seconds
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer().catch((error) => {
        this.logger.warn(
          `Buffer flush error: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 5000);
  }

  /**
   * Record a feedback signal.
   * Signals are buffered and batched for efficiency.
   *
   * @param data - Feedback data
   * @param immediate - Skip buffer and queue immediately (for important signals)
   */
  async recordFeedback(data: Omit<FeedbackJobData, 'capturedAt'>, immediate = false): Promise<string> {
    const feedbackData: FeedbackJobData = {
      ...data,
      capturedAt: new Date().toISOString(),
    };

    // Track signal type
    this.metrics.signalCounts[data.signalType] =
      (this.metrics.signalCounts[data.signalType] || 0) + 1;

    if (immediate) {
      return this.queueFeedback(feedbackData);
    }

    // Add to buffer
    const bufferKey = `${data.tenantId}:${data.userId}`;
    const existing = this.signalBuffer.get(bufferKey) || [];
    existing.push(feedbackData);
    this.signalBuffer.set(bufferKey, existing);

    // Return a predictable ID
    return `buffered-${bufferKey}-${Date.now()}`;
  }

  /**
   * Queue a feedback job immediately.
   */
  private async queueFeedback(data: FeedbackJobData): Promise<string> {
    const jobId = `feedback-${data.signalType}-${data.userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const job = await this.queue.add('feedback', data, {
      jobId,
      // Delay processing to allow related signals to arrive
      delay: data.signalType === 'draft-edited' ? 10000 : 0, // 10s delay for edits
    });

    this.logger.debug(
      `Queued feedback: ${data.signalType} from user ${data.userId} [${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Flush the signal buffer, queueing batched signals.
   */
  private async flushBuffer(): Promise<void> {
    if (this.signalBuffer.size === 0) return;

    const entries = Array.from(this.signalBuffer.entries());
    this.signalBuffer.clear();

    for (const [_bufferKey, signals] of entries) {
      // Queue each signal
      for (const signal of signals) {
        await this.queueFeedback(signal);
      }
    }
  }

  /**
   * Record explicit rating feedback (convenience method).
   */
  async recordRating(
    tenantId: string,
    userId: string,
    rating: 'up' | 'down' | number,
    ratedItem: 'draft' | 'summary' | 'classification' | 'suggestion',
    itemId: string,
    comment?: string,
  ): Promise<string> {
    return this.recordFeedback(
      {
        tenantId,
        userId,
        signalType: 'explicit-rating',
        context: {
          rating,
          ratedItem,
          itemId,
          comment,
        } as RatingFeedbackContext,
      },
      true, // Immediate for explicit ratings
    );
  }

  /**
   * Record draft acceptance feedback (convenience method).
   */
  async recordDraftAccepted(
    tenantId: string,
    userId: string,
    draftId: string,
    emailType: 'compose' | 'reply' | 'forward',
    originalPrompt?: string,
  ): Promise<string> {
    return this.recordFeedback({
      tenantId,
      userId,
      signalType: 'draft-accepted',
      context: {
        draftId,
        emailType,
        originalPrompt,
      } as DraftFeedbackContext,
    });
  }

  /**
   * Record draft edited feedback (convenience method).
   */
  async recordDraftEdited(
    tenantId: string,
    userId: string,
    draftId: string,
    emailType: 'compose' | 'reply' | 'forward',
    editDistance: number,
    sectionsEdited?: string[],
    editDurationMs?: number,
  ): Promise<string> {
    return this.recordFeedback({
      tenantId,
      userId,
      signalType: 'draft-edited',
      context: {
        draftId,
        emailType,
        editDistance,
        sectionsEdited,
        editDurationMs,
      } as DraftFeedbackContext,
    });
  }

  /**
   * Record draft rejection feedback (convenience method).
   */
  async recordDraftRejected(
    tenantId: string,
    userId: string,
    draftId: string,
    emailType: 'compose' | 'reply' | 'forward',
  ): Promise<string> {
    return this.recordFeedback({
      tenantId,
      userId,
      signalType: 'draft-rejected',
      context: {
        draftId,
        emailType,
      } as DraftFeedbackContext,
    });
  }

  /**
   * Record classification correction feedback.
   */
  async recordClassificationCorrection(
    tenantId: string,
    userId: string,
    emailId: string,
    originalCategory: string,
    correctedCategory: string,
    originalPriority?: number,
    correctedPriority?: number,
  ): Promise<string> {
    return this.recordFeedback(
      {
        tenantId,
        userId,
        signalType: 'classification-correction',
        context: {
          emailId,
          originalCategory,
          correctedCategory,
          originalPriority,
          correctedPriority,
        } as ClassificationFeedbackContext,
      },
      true, // Immediate for corrections
    );
  }

  /**
   * Get aggregated feedback statistics for a user.
   */
  async getUserFeedbackStats(
    tenantId: string,
    userId: string,
    days = 30,
  ): Promise<AggregatedFeedback | null> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString();

    // Get completed feedback jobs for this user
    const completedJobs = await this.queue.getJobs(['completed'], 0, 10000);

    const userJobs = completedJobs.filter(
      (job) =>
        job?.data?.tenantId === tenantId &&
        job?.data?.userId === userId &&
        job?.data?.capturedAt >= cutoff,
    );

    if (userJobs.length === 0) return null;

    // Aggregate signals
    const stats: AggregatedFeedback = {
      tenantId,
      userId,
      period: {
        start: cutoff,
        end: new Date().toISOString(),
      },
      signals: {
        draftsAccepted: 0,
        draftsEdited: 0,
        draftsRejected: 0,
        avgEditDistance: 0,
        positiveRatings: 0,
        negativeRatings: 0,
        preferredTones: {},
        sectionsOftenEdited: {},
      },
    };

    let totalEditDistance = 0;
    let editCount = 0;

    for (const job of userJobs) {
      const { signalType, context } = job.data;

      switch (signalType) {
        case 'draft-accepted':
          stats.signals.draftsAccepted++;
          break;
        case 'draft-edited':
          stats.signals.draftsEdited++;
          if ((context as DraftFeedbackContext).editDistance !== undefined) {
            totalEditDistance += (context as DraftFeedbackContext).editDistance!;
            editCount++;
          }
          if ((context as DraftFeedbackContext).sectionsEdited) {
            for (const section of (context as DraftFeedbackContext).sectionsEdited!) {
              stats.signals.sectionsOftenEdited[section] =
                (stats.signals.sectionsOftenEdited[section] || 0) + 1;
            }
          }
          if ((context as DraftFeedbackContext).finalTone) {
            const tone = (context as DraftFeedbackContext).finalTone!;
            stats.signals.preferredTones[tone] =
              (stats.signals.preferredTones[tone] || 0) + 1;
          }
          break;
        case 'draft-rejected':
          stats.signals.draftsRejected++;
          break;
        case 'explicit-rating':
          const rating = (context as RatingFeedbackContext).rating;
          if (rating === 'up' || (typeof rating === 'number' && rating >= 4)) {
            stats.signals.positiveRatings++;
          } else {
            stats.signals.negativeRatings++;
          }
          break;
      }
    }

    if (editCount > 0) {
      stats.signals.avgEditDistance = totalEditDistance / editCount;
    }

    return stats;
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<FeedbackQueueMetrics> {
    const counts = await this.queue.getJobCounts();

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      signalCounts: this.metrics.signalCounts as Record<FeedbackSignalType, number>,
      avgProcessingTimeMs:
        this.metrics.completed > 0
          ? Math.round(this.metrics.totalProcessingTimeMs / this.metrics.completed)
          : 0,
    };
  }

  /**
   * Remove all pending feedback jobs for a tenant.
   */
  async removeJobsForTenant(tenantId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending feedback jobs for tenant ${tenantId}`);
    }

    return removed;
  }

  /**
   * Remove all pending feedback jobs for a user.
   */
  async removeJobsForUser(tenantId: string, userId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    let removed = 0;

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId && job?.data?.userId === userId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending feedback jobs for user ${userId}`);
    }

    return removed;
  }

  /**
   * Get the underlying queue (for worker access).
   */
  getQueue(): Queue<FeedbackJobData, FeedbackJobResult> {
    return this.queue;
  }

  private async recordCompletion(jobId: string) {
    this.metrics.completed++;

    try {
      const job = await this.queue.getJob(jobId);
      if (job?.processedOn != null && job?.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.metrics.totalProcessingTimeMs += duration;
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  async onModuleDestroy() {
    this.logger.log('Closing feedback queue...');

    // Stop buffer flush
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Flush any remaining signals
    await this.flushBuffer();

    try {
      if (this.queueEvents) {
        await this.queueEvents.close();
      }

      if (this.queue) {
        await this.queue.close();
      }

      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        await this.redisConnection.quit();
      }
    } catch (error) {
      this.logger.warn(
        `Feedback queue shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Feedback queue closed');
    }
  }
}
