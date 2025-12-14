/**
 * Deadline Extractor Service
 *
 * Extracts deadlines from text using chrono-node NLP.
 * Designed for >1000 users with Redis caching and BullMQ processing.
 *
 * Features:
 * - Natural language date parsing (chrono-node)
 * - Multi-language support (en, it, fr, de, nl)
 * - Redis-based upcoming deadline cache
 * - BullMQ queue for reminder scheduling
 * - Batch processing for high throughput
 * - Tenant isolation
 *
 * Architecture:
 * - PostgreSQL: Persistent deadline storage (AiDeadline table)
 * - Redis: Hot deadline cache (upcoming 7 days)
 * - BullMQ: Reminder job scheduling
 */
import * as chrono from 'chrono-node';
import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, DeadlineStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { getConfiguration } from '../../../../config/configuration';

/** Cache namespace for deadline data */
const DEADLINE_NAMESPACE = CacheNamespace.DEADLINE_UPCOMING;

/** Default TTL for deadline cache: 1 hour */
const DEADLINE_CACHE_TTL_SEC = 3600;

/** Max upcoming deadlines to cache per user */
const MAX_CACHED_DEADLINES = 50;

/** Keywords that indicate deadlines */
const DEADLINE_KEYWORDS_EN = [
  'deadline', 'due', 'by', 'before', 'until', 'no later than',
  'must be done', 'submit by', 'complete by', 'finish by',
  'expires', 'expiration', 'cutoff', 'end date',
];

const DEADLINE_KEYWORDS_IT = [
  'scadenza', 'entro', 'prima di', 'entro e non oltre',
  'data limite', 'termine', 'consegnare entro',
];

/** Extracted deadline from text */
export interface ExtractedDeadline {
  date: Date;
  text: string;
  context: string;
  confidence: number;
  isRecurring?: boolean;
}

/** Deadline with metadata for cache */
export interface CachedDeadline {
  id: string;
  title: string;
  description?: string;
  deadline: string; // ISO string
  sourceType: string;
  sourceId?: string;
  status: DeadlineStatus;
  confidence?: number;
  remindBefore: number[];
  createdAt: string;
}

/** Job data for deadline reminder queue */
export interface DeadlineReminderJobData {
  type: 'reminder' | 'check-overdue' | 'extract-batch';
  deadlineId?: string;
  tenantId: string;
  userId?: string;
  // For batch extraction
  emailIds?: string[];
}

/** Job result */
export interface DeadlineJobResult {
  processed: number;
  reminders: number;
  errors: number;
}

@Injectable()
export class DeadlineExtractorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadlineExtractorService.name);
  private queue!: Queue<DeadlineReminderJobData>;
  private worker!: Worker<DeadlineReminderJobData, DeadlineJobResult>;

  // Configuration
  private readonly ENABLED: boolean;
  private readonly BATCH_SIZE: number;
  private readonly MIN_CONFIDENCE: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.ENABLED =
      (this.configService.get<string>('DEADLINE_EXTRACTION_ENABLED') || 'true').toLowerCase() !== 'false';
    this.BATCH_SIZE = parseInt(
      this.configService.get<string>('DEADLINE_BATCH_SIZE', '50'),
      10,
    );
    this.MIN_CONFIDENCE = parseFloat(
      this.configService.get<string>('DEADLINE_MIN_CONFIDENCE', '0.5'),
    );
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('DeadlineExtractorService disabled via DEADLINE_EXTRACTION_ENABLED=false');
      return;
    }

    const redisConfig = getConfiguration().redis;
    const connection = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
    };

    // Create BullMQ queue for deadline reminders
    this.queue = new Queue<DeadlineReminderJobData>('ai-deadline-reminders', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100, age: 3600 },
        removeOnFail: { count: 500 },
      },
    });

    // Create worker for processing deadline jobs
    this.worker = new Worker<DeadlineReminderJobData, DeadlineJobResult>(
      'ai-deadline-reminders',
      async (job) => this.processJob(job),
      {
        connection,
        concurrency: 5, // Process 5 jobs in parallel
        limiter: {
          max: 100, // Max 100 jobs per minute (for >1000 users)
          duration: 60000,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Deadline job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Deadline job ${job?.id} failed: ${err.message}`);
    });

    // Schedule recurring job to check for overdue deadlines every 15 minutes
    await this.queue.add(
      'check-overdue',
      { type: 'check-overdue', tenantId: '*' },
      {
        repeat: { pattern: '*/15 * * * *' }, // Every 15 minutes
        jobId: 'deadline-overdue-check',
      },
    );

    this.logger.log('✅ DeadlineExtractorService initialized with BullMQ');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.ENABLED;
  }

  // ==========================================================================
  // EXTRACTION METHODS
  // ==========================================================================

  /**
   * Extract deadlines from text using chrono-node NLP.
   * Supports English and Italian with keyword context validation.
   */
  extractDeadlines(
    text: string,
    referenceDate = new Date(),
    locale: 'en' | 'it' = 'en',
  ): ExtractedDeadline[] {
    if (!text || text.length < 10) return [];

    // Select parser based on locale
    const parser = locale === 'it' ? chrono.it : chrono;
    const keywords = locale === 'it'
      ? [...DEADLINE_KEYWORDS_EN, ...DEADLINE_KEYWORDS_IT]
      : DEADLINE_KEYWORDS_EN;

    const results = parser.parse(text, referenceDate, { forwardDate: true });
    const deadlines: ExtractedDeadline[] = [];

    for (const result of results) {
      // Get context around the date mention (±100 chars)
      const context = this.getContext(text, result.index, 100);
      const contextLower = context.toLowerCase();

      // Check if this date mention is near a deadline keyword
      const hasDeadlineKeyword = keywords.some((k) => contextLower.includes(k));

      // Calculate confidence based on keyword presence and date certainty
      const confidence = this.calculateConfidence(result, hasDeadlineKeyword, context);

      // Only include if confidence meets threshold or has explicit keyword
      if (confidence >= this.MIN_CONFIDENCE || hasDeadlineKeyword) {
        const deadline: ExtractedDeadline = {
          date: result.start.date(),
          text: result.text,
          context: context.trim(),
          confidence,
        };

        // Check for recurring patterns
        if (this.isRecurringPattern(context)) {
          deadline.isRecurring = true;
        }

        deadlines.push(deadline);
      }
    }

    return deadlines;
  }

  /**
   * Get surrounding context for a position in text.
   */
  private getContext(text: string, position: number, range: number): string {
    const start = Math.max(0, position - range);
    const end = Math.min(text.length, position + range);
    return text.slice(start, end);
  }

  /**
   * Calculate confidence score for extracted deadline.
   */
  private calculateConfidence(
    result: chrono.ParsedResult,
    hasKeyword: boolean,
    context: string,
  ): number {
    let confidence = 0.3; // Base confidence

    // Boost for explicit deadline keywords
    if (hasKeyword) {
      confidence += 0.4;
    }

    // Boost for specific time (not just date)
    if (result.start.isCertain('hour')) {
      confidence += 0.1;
    }

    // Boost for explicit date format (e.g., "December 20th")
    if (result.start.isCertain('month') && result.start.isCertain('day')) {
      confidence += 0.1;
    }

    // Penalize very far future dates (>1 year)
    const daysUntil = (result.start.date().getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntil > 365) {
      confidence -= 0.2;
    }

    // Boost for urgency words
    const urgencyWords = ['urgent', 'asap', 'immediately', 'critical', 'importante', 'urgente'];
    if (urgencyWords.some((w) => context.toLowerCase().includes(w))) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Check if the context indicates a recurring deadline.
   */
  private isRecurringPattern(context: string): boolean {
    const recurringPatterns = [
      /every (week|month|day|monday|tuesday|wednesday|thursday|friday)/i,
      /weekly|monthly|daily|annually/i,
      /ogni (settimana|mese|giorno|lunedì|martedì)/i,
      /settimanale|mensile|giornaliero/i,
    ];
    return recurringPatterns.some((p) => p.test(context));
  }

  // ==========================================================================
  // DATABASE OPERATIONS
  // ==========================================================================

  /**
   * Extract deadlines from email and store in database.
   * Designed for batch processing (>1000 users).
   */
  async extractFromEmail(
    tenantId: string,
    userId: string,
    emailId: string,
    subject: string,
    body: string,
    locale: 'en' | 'it' = 'en',
  ): Promise<string[]> {
    const text = `${subject}\n\n${body}`;
    const deadlines = this.extractDeadlines(text, new Date(), locale);
    const createdIds: string[] = [];

    for (const deadline of deadlines) {
      try {
        const title = this.extractTitle(deadline.context, subject);

        const created = await this.prisma.aiDeadline.create({
          data: {
            tenantId,
            userId,
            title,
            description: deadline.context,
            deadline: deadline.date,
            sourceType: 'EMAIL',
            sourceId: emailId,
            confidence: deadline.confidence,
            status: 'UPCOMING',
          },
        });

        createdIds.push(created.id);

        // Schedule reminder jobs
        await this.scheduleReminders(created.id, tenantId, userId, deadline.date);

        this.logger.debug(
          `Extracted deadline "${title}" for ${deadline.date.toISOString()} from email ${emailId}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to create deadline from email ${emailId}: ${msg}`);
      }
    }

    // Invalidate cache for this user
    if (createdIds.length > 0) {
      await this.invalidateUserCache(tenantId, userId);

      // Log deadline extraction (realtime events can be added via RealtimeEventsService if needed)
      this.logger.debug(`Created ${createdIds.length} deadlines for user ${userId}`);
    }

    return createdIds;
  }

  /**
   * Extract a title from deadline context.
   */
  private extractTitle(context: string, fallback: string): string {
    // Try to find a sentence containing the deadline
    const sentences = context.split(/[.!?\n]+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 100) {
        return trimmed;
      }
    }
    // Fall back to subject or truncated context
    return fallback.slice(0, 100) || context.slice(0, 100);
  }

  /**
   * Schedule reminder jobs for a deadline.
   */
  private async scheduleReminders(
    deadlineId: string,
    tenantId: string,
    userId: string,
    deadlineDate: Date,
  ): Promise<void> {
    if (!this.queue) return;

    const remindBefore = [1440, 60]; // 1 day, 1 hour before (in minutes)
    const now = Date.now();

    for (const minutesBefore of remindBefore) {
      const reminderTime = new Date(deadlineDate.getTime() - minutesBefore * 60 * 1000);

      // Only schedule if reminder time is in the future
      if (reminderTime.getTime() > now) {
        const delay = reminderTime.getTime() - now;

        await this.queue.add(
          'reminder',
          {
            type: 'reminder',
            deadlineId,
            tenantId,
            userId,
          },
          {
            delay,
            jobId: `reminder-${deadlineId}-${minutesBefore}`,
          },
        );
      }
    }
  }

  /**
   * Get upcoming deadlines for a user from Redis cache or database.
   */
  async getUpcomingDeadlines(
    tenantId: string,
    userId: string,
    days = 7,
  ): Promise<CachedDeadline[]> {
    const cacheKey = `${tenantId}:${userId}`;

    // Try Redis cache first
    const cached = await this.cacheService.get<CachedDeadline[]>(cacheKey, {
      namespace: DEADLINE_NAMESPACE,
    });

    if (cached) {
      // Filter to only include deadlines within the requested days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      return cached.filter((d) => new Date(d.deadline) <= cutoff);
    }

    // Cache miss - fetch from database
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 7); // Always cache 7 days

    const deadlines = await this.prisma.aiDeadline.findMany({
      where: {
        tenantId,
        userId,
        status: { in: ['UPCOMING', 'DUE_SOON'] },
        deadline: {
          gte: new Date(),
          lte: cutoffDate,
        },
      },
      orderBy: { deadline: 'asc' },
      take: MAX_CACHED_DEADLINES,
    });

    // Transform to cache format
    const cachedDeadlines: CachedDeadline[] = deadlines.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description ?? undefined,
      deadline: d.deadline.toISOString(),
      sourceType: d.sourceType,
      sourceId: d.sourceId ?? undefined,
      status: d.status,
      confidence: d.confidence ?? undefined,
      remindBefore: d.remindBefore,
      createdAt: d.createdAt.toISOString(),
    }));

    // Store in Redis cache
    await this.cacheService.set(cacheKey, cachedDeadlines, {
      namespace: DEADLINE_NAMESPACE,
      ttl: DEADLINE_CACHE_TTL_SEC,
    });

    // Filter to requested days
    const requestedCutoff = new Date();
    requestedCutoff.setDate(requestedCutoff.getDate() + days);
    return cachedDeadlines.filter((d) => new Date(d.deadline) <= requestedCutoff);
  }

  /**
   * Mark a deadline as completed.
   */
  async completeDeadline(
    tenantId: string,
    userId: string,
    deadlineId: string,
  ): Promise<void> {
    await this.prisma.aiDeadline.update({
      where: { id: deadlineId, tenantId, userId },
      data: {
        status: 'COMPLETED',
        acknowledgedAt: new Date(),
      },
    });

    await this.invalidateUserCache(tenantId, userId);
  }

  /**
   * Dismiss a deadline.
   */
  async dismissDeadline(
    tenantId: string,
    userId: string,
    deadlineId: string,
  ): Promise<void> {
    await this.prisma.aiDeadline.update({
      where: { id: deadlineId, tenantId, userId },
      data: {
        status: 'DISMISSED',
        acknowledgedAt: new Date(),
      },
    });

    await this.invalidateUserCache(tenantId, userId);
  }

  /**
   * Get deadline statistics for a user.
   */
  async getDeadlineStats(
    tenantId: string,
    userId: string,
  ): Promise<{
    upcoming: number;
    dueSoon: number;
    overdue: number;
    completed: number;
  }> {
    const [upcoming, dueSoon, overdue, completed] = await Promise.all([
      this.prisma.aiDeadline.count({
        where: { tenantId, userId, status: 'UPCOMING' },
      }),
      this.prisma.aiDeadline.count({
        where: { tenantId, userId, status: 'DUE_SOON' },
      }),
      this.prisma.aiDeadline.count({
        where: { tenantId, userId, status: 'OVERDUE' },
      }),
      this.prisma.aiDeadline.count({
        where: { tenantId, userId, status: 'COMPLETED' },
      }),
    ]);

    return { upcoming, dueSoon, overdue, completed };
  }

  /**
   * Invalidate Redis cache for a user's deadlines.
   */
  private async invalidateUserCache(tenantId: string, userId: string): Promise<void> {
    const cacheKey = `${tenantId}:${userId}`;
    await this.cacheService.del(cacheKey, { namespace: DEADLINE_NAMESPACE });
  }

  // ==========================================================================
  // BULLMQ JOB PROCESSING
  // ==========================================================================

  /**
   * Process BullMQ job.
   */
  private async processJob(
    job: Job<DeadlineReminderJobData>,
  ): Promise<DeadlineJobResult> {
    const { type, tenantId, userId, deadlineId, emailIds } = job.data;

    switch (type) {
      case 'reminder':
        return this.processReminder(deadlineId!, tenantId, userId!);

      case 'check-overdue':
        return this.processOverdueCheck(tenantId);

      case 'extract-batch':
        return this.processExtractBatch(tenantId, userId!, emailIds!);

      default:
        this.logger.warn(`Unknown job type: ${type}`);
        return { processed: 0, reminders: 0, errors: 1 };
    }
  }

  /**
   * Process a reminder notification.
   */
  private async processReminder(
    deadlineId: string,
    tenantId: string,
    userId: string,
  ): Promise<DeadlineJobResult> {
    try {
      const deadline = await this.prisma.aiDeadline.findUnique({
        where: { id: deadlineId },
      });

      if (!deadline || deadline.status !== 'UPCOMING') {
        return { processed: 1, reminders: 0, errors: 0 };
      }

      // Update status to DUE_SOON if within 2 hours
      const hoursUntil = (deadline.deadline.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil <= 2 && deadline.status === 'UPCOMING') {
        await this.prisma.aiDeadline.update({
          where: { id: deadlineId },
          data: {
            status: 'DUE_SOON',
            lastRemindedAt: new Date(),
          },
        });
        await this.invalidateUserCache(tenantId, userId);
      }

      // Log reminder (realtime events can be added via RealtimeEventsService if needed)
      this.logger.log(
        `Deadline reminder: "${deadline.title}" due in ${Math.round(hoursUntil * 10) / 10}h`,
      );

      return { processed: 1, reminders: 1, errors: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process reminder for ${deadlineId}: ${msg}`);
      return { processed: 1, reminders: 0, errors: 1 };
    }
  }

  /**
   * Check for overdue deadlines across all tenants.
   */
  private async processOverdueCheck(tenantId: string): Promise<DeadlineJobResult> {
    try {
      const now = new Date();
      let processed = 0;

      // Find all upcoming/due-soon deadlines that are now past due
      const overdueDeadlines = await this.prisma.aiDeadline.findMany({
        where: {
          ...(tenantId !== '*' && { tenantId }),
          status: { in: ['UPCOMING', 'DUE_SOON'] },
          deadline: { lt: now },
        },
        take: this.BATCH_SIZE,
      });

      // Update to OVERDUE status
      for (const deadline of overdueDeadlines) {
        await this.prisma.aiDeadline.update({
          where: { id: deadline.id },
          data: { status: 'OVERDUE' },
        });

        await this.invalidateUserCache(deadline.tenantId, deadline.userId);

        // Log overdue deadline (realtime events can be added via RealtimeEventsService if needed)
        this.logger.warn(`Deadline overdue: "${deadline.title}" for user ${deadline.userId}`);

        processed++;
      }

      this.logger.debug(`Processed ${processed} overdue deadlines`);
      return { processed, reminders: 0, errors: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to check overdue deadlines: ${msg}`);
      return { processed: 0, reminders: 0, errors: 1 };
    }
  }

  /**
   * Process batch extraction from emails.
   */
  private async processExtractBatch(
    tenantId: string,
    userId: string,
    emailIds: string[],
  ): Promise<DeadlineJobResult> {
    let processed = 0;
    let errors = 0;

    for (const emailId of emailIds) {
      try {
        const email = await this.prisma.email.findUnique({
          where: { id: emailId },
          select: { subject: true, bodyText: true },
        });

        if (email) {
          await this.extractFromEmail(
            tenantId,
            userId,
            emailId,
            email.subject ?? '',
            email.bodyText ?? '',
          );
          processed++;
        }
      } catch (error) {
        errors++;
      }
    }

    return { processed, reminders: 0, errors };
  }

  // ==========================================================================
  // QUEUE MANAGEMENT
  // ==========================================================================

  /**
   * Queue batch deadline extraction for multiple emails.
   */
  async queueBatchExtraction(
    tenantId: string,
    userId: string,
    emailIds: string[],
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('DeadlineExtractorService not initialized');
    }

    const job = await this.queue.add(
      'extract-batch',
      {
        type: 'extract-batch',
        tenantId,
        userId,
        emailIds,
      },
      {
        priority: 2, // Lower priority than reminders
      },
    );

    return job.id ?? 'unknown';
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}
