/**
 * Daily Briefing Service (Enhanced)
 *
 * Pre-computes personalized daily briefings for users.
 * Aggregates data from all AI Secretary services:
 * - Email summary (unread, urgent, highlights)
 * - Pending follow-ups (from FollowUpService)
 * - Upcoming deadlines (from DeadlineExtractorService)
 * - Action items (from ActionItemService)
 * - Calendar events (today's meetings)
 *
 * Runs as a scheduled BullMQ job to generate summaries during off-peak hours.
 * Briefings are cached in Redis for instant retrieval.
 *
 * Features:
 * - Configurable schedule (default: 6 AM user's timezone)
 * - Per-user timezone support
 * - Redis caching for instant access
 * - Multi-tenant support (processes active users across all tenants)
 * - Graceful degradation if AI service unavailable
 * - Aggregated insights from all AI Secretary services
 */
import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';
import { FollowUpService } from './follow-up.service';
// DeadlineExtractorService and ActionItemService removed - AI refactor v2.0
// These services can be restored from archive/memory folder
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';
import { UsageTrackingService } from '../../../subscription/services/usage-tracking.service';
import { getLocale, getTranslations, SupportedLocale } from '../locales';

/** Cached deadline type (simplified for v2.0) */
export interface CachedDeadline {
  id: string;
  deadline: string;
  emailSubject: string;
  priority: string;
}

/** Cache namespace for daily briefings */
const BRIEFING_NAMESPACE = 'briefing:daily' as CacheNamespace;

/** Default TTL for briefings: 24 hours */
const BRIEFING_TTL_SEC = 86400;

interface BriefingJobData {
  type: 'scheduled' | 'manual';
  userId?: string; // For manual single-user briefing
  tenantId?: string;
}

interface BriefingResult {
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
}

/** Enhanced daily briefing with aggregated AI Secretary data */
export interface DailyBriefing {
  userId: string;
  tenantId: string;
  generatedAt: string;
  /** Briefing validity period */
  validUntil: string;
  /** Summary of recent emails */
  summary: string;
  /** Key highlights/action items */
  highlights: string[];
  /** Urgent items requiring attention */
  urgent: string[];
  /** Email statistics */
  stats: {
    totalUnread: number;
    newToday: number;
    requiresResponse: number;
  };
  /** Provider breakdown (if multiple accounts) */
  byProvider?: Array<{
    email: string;
    displayName?: string;
    scope?: string;
    unread: number;
    highlights: string[];
  }>;

  // ============================================
  // ENHANCED: AI Secretary Aggregated Data
  // ============================================

  /** Follow-up tracking data */
  followUps?: {
    pending: number;
    overdue: number;
    dueToday: number;
    items: Array<{
      id: string;
      emailId: string;
      reason: string | null;
      dueDate: string;
      status: string;
    }>;
    message: string;
  };

  /** Deadline alerts */
  deadlines?: {
    today: CachedDeadline[];
    thisWeek: CachedDeadline[];
    overdue: number;
    message: string;
  };

  /** Action items */
  actionItems?: {
    todo: number;
    inProgress: number;
    overdue: number;
    highPriority: number;
    dueToday: Array<{
      id: string;
      title: string;
      priority: number;
      dueDate: string | null;
      sourceType: string;
    }>;
    message: string;
  };

  /** Calendar events for today */
  calendar?: {
    todaysMeetings: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      location?: string;
    }>;
    message: string;
  };
}

@Injectable()
export class DailyBriefingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyBriefingService.name);
  private queue!: Queue<BriefingJobData>;
  private worker!: Worker<BriefingJobData, BriefingResult>;

  // Configuration
  private readonly ENABLED: boolean;
  private readonly SCHEDULE_HOUR: number; // Hour to run (in user's timezone)
  private readonly BATCH_SIZE: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly mistralService: MistralService,
    private readonly configService: ConfigService,
    // AI Secretary services for enhanced briefing
    private readonly followUpService: FollowUpService,
    // DeadlineExtractorService removed - AI refactor v2.0
    // ActionItemService removed - AI refactor v2.0
    @Optional() private readonly usageTrackingService?: UsageTrackingService,
  ) {
    this.ENABLED =
      (this.configService.get<string>('DAILY_BRIEFING_ENABLED') || 'true').toLowerCase() !== 'false';
    this.SCHEDULE_HOUR = parseInt(
      this.configService.get<string>('DAILY_BRIEFING_HOUR', '6'), // 6 AM
      10,
    );
    this.BATCH_SIZE = parseInt(
      this.configService.get<string>('DAILY_BRIEFING_BATCH_SIZE', '10'),
      10,
    );
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('DailyBriefingService disabled via DAILY_BRIEFING_ENABLED=false');
      return;
    }

    const connection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<number>('REDIS_PORT', 6379)),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };

    // Create queue
    this.queue = new Queue<BriefingJobData>('daily-briefing', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    // Create worker
    this.worker = new Worker<BriefingJobData, BriefingResult>(
      'daily-briefing',
      async (job: Job<BriefingJobData>) => {
        return this.processBriefingJob(job);
      },
      {
        connection,
        concurrency: 2, // Process 2 users in parallel
        lockDuration: 600000, // 10 minute lock (briefing generation can be slow)
      },
    );

    this.worker.on('completed', (_job, result) => {
      this.logger.log(
        `Briefing job completed: generated ${result.generated}, skipped ${result.skipped}, errors ${result.errors}`,
      );
    });

    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Briefing job failed: ${error?.message ?? error}`);
    });

    // Setup repeatable job (runs every hour to check user timezones)
    await this.setupRepeatableJob();

    this.logger.log(
      `DailyBriefingService enabled: schedule hour ${this.SCHEDULE_HOUR}, batch size ${this.BATCH_SIZE}`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Setup repeatable job - runs hourly to process users in their target timezone
   */
  private async setupRepeatableJob() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === 'scheduled-briefing') {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    // Run every hour at minute 5 (to avoid exactly on the hour)
    await this.queue.add(
      'scheduled-briefing',
      { type: 'scheduled' },
      {
        repeat: {
          pattern: '5 * * * *', // Every hour at :05
        },
        jobId: 'daily-briefing-scheduled',
      },
    );
  }

  /**
   * Process briefing generation job
   */
  private async processBriefingJob(job: Job<BriefingJobData>): Promise<BriefingResult> {
    const result: BriefingResult = { processed: 0, generated: 0, skipped: 0, errors: 0 };

    // For manual single-user briefing
    if (job.data.type === 'manual' && job.data.userId && job.data.tenantId) {
      try {
        await this.generateBriefingForUser(job.data.tenantId, job.data.userId);
        result.processed = 1;
        result.generated = 1;
      } catch (error) {
        this.logger.error(`Failed to generate manual briefing: ${error}`);
        result.errors = 1;
      }
      return result;
    }

    // Scheduled job - find users who need briefings
    const usersToProcess = await this.findUsersForBriefing();

    for (const user of usersToProcess) {
      result.processed++;

      try {
        // Check if briefing already exists for today
        const existing = await this.getBriefing(user.tenantId, user.id);
        if (existing) {
          result.skipped++;
          continue;
        }

        await this.generateBriefingForUser(user.tenantId, user.id);
        result.generated++;

        // Update progress
        await job.updateProgress({
          processed: result.processed,
          generated: result.generated,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to generate briefing for user ${user.id}: ${message}`);
        result.errors++;
      }

      // Small delay between users
      await this.sleep(100);
    }

    return result;
  }

  /**
   * Find users who should receive briefings this hour.
   * Matches users whose timezone makes it currently the target hour.
   */
  private async findUsersForBriefing(): Promise<Array<{ id: string; tenantId: string; timezone?: string }>> {
    const now = new Date();

    // Find users with preferences where current UTC hour matches their local target hour
    // For simplicity, we get all active users and filter by timezone
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        userPreferences: {
          select: {
            timezone: true,
          },
        },
      },
      take: this.BATCH_SIZE * 10, // Get more, filter by timezone
    });

    // Filter to users whose local time is the target hour
    return users.filter((user) => {
      const timezone = user.userPreferences?.timezone || 'UTC';
      try {
        const userHour = this.getHourInTimezone(now, timezone);
        return userHour === this.SCHEDULE_HOUR;
      } catch {
        // Invalid timezone, skip
        return false;
      }
    }).slice(0, this.BATCH_SIZE).map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      timezone: u.userPreferences?.timezone || undefined,
    }));
  }

  /**
   * Get the current hour in a specific timezone
   */
  private getHourInTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  }

  /**
   * Generate briefing for a specific user
   */
  private async generateBriefingForUser(tenantId: string, userId: string): Promise<DailyBriefing> {
    this.logger.debug(`Generating enhanced briefing for user ${userId}`);

    // Get user's language preference for locale-aware content
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { language: true },
    });
    const locale = getLocale(userPrefs?.language || undefined);

    // Get translations for this locale
    const t = getTranslations(locale);

    // P10: Check subscription quota before AI call (prevents overage)
    if (this.usageTrackingService) {
      const canProceed = await this.usageTrackingService.checkQuota(tenantId, 'ai-calls');
      if (!canProceed) {
        this.logger.warn(`[tenant:${tenantId}] AI quota exceeded for daily briefing - returning fallback`);
        return {
          userId,
          tenantId,
          generatedAt: new Date().toISOString(),
          validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour
          summary: t.briefing.quotaExceeded,
          highlights: [],
          urgent: [],
          stats: { totalUnread: 0, newToday: 0, requiresResponse: 0 },
        };
      }
    }

    // Get user's email stats
    const stats = await this.getEmailStats(tenantId, userId);

    // Get recent unread emails for summarization
    const recentEmails = await this.getRecentUnreadEmails(tenantId, userId, 20);

    // Generate AI summary (locale-aware)
    const aiSummary = await this.generateAISummary(tenantId, userId, recentEmails, stats, locale);

    // Get enhanced AI Secretary data (in parallel for performance, locale-aware)
    const [followUpsData, deadlinesData, actionItemsData, calendarData] = await Promise.all([
      this.getFollowUpsData(tenantId, userId, locale),
      this.getDeadlinesData(tenantId, userId, locale),
      this.getActionItemsData(tenantId, userId, locale),
      this.getCalendarData(tenantId, userId, locale),
    ]);

    const now = new Date();
    const validUntil = new Date(now.getTime() + BRIEFING_TTL_SEC * 1000);

    const briefing: DailyBriefing = {
      userId,
      tenantId,
      generatedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      summary: aiSummary.summary,
      highlights: aiSummary.highlights,
      urgent: aiSummary.urgent,
      stats,
      // Enhanced AI Secretary data
      followUps: followUpsData,
      deadlines: deadlinesData,
      actionItems: actionItemsData,
      calendar: calendarData,
    };

    // P10: Track successful AI call usage (after completion)
    if (this.usageTrackingService) {
      await this.usageTrackingService.trackUsage(tenantId, 'ai-calls', 1).catch((err: Error) => {
        this.logger.warn(`[tenant:${tenantId}] Failed to track AI usage: ${err.message}`);
      });
    }

    // Cache the briefing
    const cacheKey = `${tenantId}:${userId}`;
    if (this.cacheService.isHealthy()) {
      await this.cacheService.set(cacheKey, briefing, {
        ttl: BRIEFING_TTL_SEC,
        namespace: BRIEFING_NAMESPACE,
      });
    }

    return briefing;
  }

  // ==========================================================================
  // ENHANCED: AI Secretary Data Aggregation Methods
  // ==========================================================================

  /**
   * Get follow-up tracking data for briefing (locale-aware)
   */
  private async getFollowUpsData(tenantId: string, userId: string, locale: SupportedLocale): Promise<DailyBriefing['followUps']> {
    const t = getTranslations(locale);
    try {
      const [stats, pending] = await Promise.all([
        this.followUpService.getStats(tenantId, userId),
        this.followUpService.getPendingFollowUps(tenantId, userId),
      ]);

      const items = pending.slice(0, 5).map((f) => ({
        id: f.id,
        emailId: f.emailId,
        reason: f.reason,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
      }));

      let message = '';
      if (stats.overdue > 0) {
        message = t.briefing.followUps.overdue(stats.overdue);
      } else if (stats.dueToday > 0) {
        message = t.briefing.followUps.dueToday(stats.dueToday);
      } else if (stats.pending > 0) {
        message = t.briefing.followUps.pending(stats.pending);
      } else {
        message = t.briefing.followUps.none;
      }

      return {
        pending: stats.pending,
        overdue: stats.overdue,
        dueToday: stats.dueToday,
        items,
        message,
      };
    } catch (error) {
      this.logger.warn(`Failed to get follow-ups data: ${error}`);
      return {
        pending: 0,
        overdue: 0,
        dueToday: 0,
        items: [],
        message: t.briefing.followUps.unavailable,
      };
    }
  }

  /**
   * Get deadline alerts data for briefing (locale-aware)
   * DeadlineExtractorService removed - AI refactor v2.0
   * Returns empty data until service is restored from archive
   */
  private async getDeadlinesData(_tenantId: string, _userId: string, locale: SupportedLocale): Promise<DailyBriefing['deadlines']> {
    const t = getTranslations(locale);
    // DeadlineExtractorService removed - AI refactor v2.0
    // Service can be restored from archive/memory folder when needed
    return {
      today: [],
      thisWeek: [],
      overdue: 0,
      message: t.briefing.deadlines.placeholder,
    };
  }

  /**
   * Get action items data for briefing (locale-aware)
   * ActionItemService removed - AI refactor v2.0
   * Returns empty data until service is restored from archive
   */
  private async getActionItemsData(_tenantId: string, _userId: string, locale: SupportedLocale): Promise<DailyBriefing['actionItems']> {
    const t = getTranslations(locale);
    // ActionItemService removed - AI refactor v2.0
    // Service can be restored from archive/memory folder when needed
    return {
      todo: 0,
      inProgress: 0,
      overdue: 0,
      highPriority: 0,
      dueToday: [],
      message: t.briefing.actionItems.placeholder,
    };
  }

  /**
   * Get today's calendar events for briefing (locale-aware)
   * Note: Calendar integration is optional - returns empty if not available
   */
  private async getCalendarData(_tenantId: string, _userId: string, locale: SupportedLocale): Promise<DailyBriefing['calendar']> {
    const t = getTranslations(locale);
    try {
      // Calendar events are fetched via CalendarModule if available
      // For now, return placeholder - can be enhanced with CalendarService injection
      // This allows the briefing to work even without calendar integration

      return {
        todaysMeetings: [],
        message: t.briefing.calendar.available,
      };
    } catch (error) {
      this.logger.warn(`Failed to get calendar data: ${error}`);
      return {
        todaysMeetings: [],
        message: t.briefing.calendar.unavailable,
      };
    }
  }

  /**
   * Get email statistics for user
   */
  private async getEmailStats(
    tenantId: string,
    userId: string,
  ): Promise<DailyBriefing['stats']> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get user's provider configs
    const providers = await this.prisma.providerConfig.findMany({
      where: { tenantId, userId, isActive: true },
      select: { id: true },
    });
    const providerIds = providers.map((p) => p.id);

    if (providerIds.length === 0) {
      return { totalUnread: 0, newToday: 0, requiresResponse: 0 };
    }

    // Exclude SPAM and TRASH - they're junk and shouldn't be in briefings
    const [totalUnread, newToday] = await Promise.all([
      this.prisma.email.count({
        where: {
          tenantId,
          providerId: { in: providerIds },
          isRead: false,
          isDeleted: false,
          folder: EXCLUDE_JUNK_FOLDERS,
        },
      }),
      this.prisma.email.count({
        where: {
          tenantId,
          providerId: { in: providerIds },
          receivedAt: { gte: todayStart },
          isDeleted: false,
          folder: EXCLUDE_JUNK_FOLDERS,
        },
      }),
    ]);

    // Estimate emails requiring response (questions, requests)
    // Simple heuristic: unread emails with '?' in subject or body
    const requiresResponse = await this.prisma.email.count({
      where: {
        tenantId,
        providerId: { in: providerIds },
        isRead: false,
        isDeleted: false,
        folder: EXCLUDE_JUNK_FOLDERS,
        OR: [
          { subject: { contains: '?' } },
          { snippet: { contains: '?' } },
        ],
      },
    });

    return { totalUnread, newToday, requiresResponse };
  }

  /**
   * Get recent unread emails for summarization
   */
  private async getRecentUnreadEmails(
    tenantId: string,
    userId: string,
    limit: number,
  ): Promise<Array<{ subject: string | null; from: string | null; snippet: string | null; receivedAt: Date | null }>> {
    const providers = await this.prisma.providerConfig.findMany({
      where: { tenantId, userId, isActive: true },
      select: { id: true },
    });
    const providerIds = providers.map((p) => p.id);

    if (providerIds.length === 0) return [];

    // Exclude SPAM and TRASH - they're junk and shouldn't be summarized
    return this.prisma.email.findMany({
      where: {
        tenantId,
        providerId: { in: providerIds },
        isRead: false,
        isDeleted: false,
        folder: EXCLUDE_JUNK_FOLDERS,
      },
      select: {
        subject: true,
        from: true,
        snippet: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Generate AI summary from emails (locale-aware)
   */
  private async generateAISummary(
    tenantId: string,
    userId: string,
    emails: Array<{ subject: string | null; from: string | null; snippet: string | null }>,
    stats: DailyBriefing['stats'],
    locale: SupportedLocale = 'en',
  ): Promise<{ summary: string; highlights: string[]; urgent: string[] }> {
    const t = getTranslations(locale);

    if (emails.length === 0) {
      return {
        summary: t.briefing.emptyInbox,
        highlights: [],
        urgent: [],
      };
    }

    // Build context for AI
    const emailList = emails
      .slice(0, 10) // Limit for token budget
      .map((e, i) => `${i + 1}. From: ${e.from || 'Unknown'} | Subject: ${e.subject || '(no subject)'} | Preview: ${e.snippet?.slice(0, 100) || ''}`)
      .join('\n');

    const prompt = `You are an email assistant. Analyze these unread emails and provide a brief daily briefing.

${t.briefing.aiPromptLanguage}

Stats:
- Total unread: ${stats.totalUnread}
- New today: ${stats.newToday}
- Likely need response: ${stats.requiresResponse}

Recent unread emails:
${emailList}

Provide a JSON response with:
1. "summary": A 1-2 sentence overview of the inbox status
2. "highlights": Array of 3-5 key points (important senders, topics, deadlines)
3. "urgent": Array of items that need immediate attention (if any)

Respond ONLY with valid JSON, no markdown.`;

    try {
      const response = await this.mistralService.generateResponse(
        tenantId,
        userId,
        prompt,
        [],
        { conversationId: 'daily-briefing' },
      );

      // Parse JSON response
      const parsed = JSON.parse(response);
      return {
        summary: parsed.summary || t.briefing.fallbackSummary(stats.totalUnread, stats.newToday),
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        urgent: Array.isArray(parsed.urgent) ? parsed.urgent : [],
      };
    } catch (error) {
      this.logger.warn(`AI summary generation failed: ${error}`);
      return {
        summary: t.briefing.fallbackSummary(stats.totalUnread, stats.newToday),
        highlights: emails.slice(0, 3).map((e) => `${t.briefing.emailFrom} ${e.from}: ${e.subject}`),
        urgent: [],
      };
    }
  }

  /**
   * Get cached briefing for a user
   */
  async getBriefing(tenantId: string, userId: string): Promise<DailyBriefing | null> {
    const cacheKey = `${tenantId}:${userId}`;

    if (!this.cacheService.isHealthy()) {
      return null;
    }

    try {
      return await this.cacheService.get<DailyBriefing>(cacheKey, {
        namespace: BRIEFING_NAMESPACE,
      });
    } catch {
      return null;
    }
  }

  /**
   * Generate briefing on-demand for a user
   */
  async generateBriefingOnDemand(tenantId: string, userId: string): Promise<DailyBriefing> {
    // Check cache first
    const cached = await this.getBriefing(tenantId, userId);
    if (cached) {
      return cached;
    }

    // Generate fresh
    return this.generateBriefingForUser(tenantId, userId);
  }

  /**
   * Manually trigger briefing generation for a user
   */
  async triggerManualBriefing(tenantId: string, userId: string): Promise<{ jobId: string }> {
    if (!this.queue) {
      // Queue not initialized, generate directly
      await this.generateBriefingForUser(tenantId, userId);
      return { jobId: 'direct' };
    }

    const job = await this.queue.add(
      'manual-briefing',
      { type: 'manual', tenantId, userId },
      {
        priority: 1,
        jobId: `manual-briefing-${tenantId}-${userId}-${Date.now()}`,
      },
    );

    return { jobId: job.id ?? 'unknown' };
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    enabled: boolean;
    scheduleHour: number;
    batchSize: number;
    queueStats: { waiting: number; active: number; completed: number; failed: number } | null;
  }> {
    let queueStats = null;
    if (this.queue) {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
      ]);
      queueStats = { waiting, active, completed, failed };
    }

    return {
      enabled: this.ENABLED,
      scheduleHour: this.SCHEDULE_HOUR,
      batchSize: this.BATCH_SIZE,
      queueStats,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
